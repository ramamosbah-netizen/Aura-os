import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type HealthSignal, type Id, type OrgLevel, type Page, type PageParams, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import {
  type HseIncident,
  makeHseIncident,
  startIncidentInvestigation,
  closeIncidentTransition,
  reopenIncident,
} from './domain/hse-incident';
import {
  type PermitToWork,
  makePermitToWork,
  requestPermitTransition,
  approvePermitTransition,
  rejectPermitTransition,
  reopenPermitTransition,
  closePermitTransition,
  expirePermitTransition,
  isWithinValidity,
} from './domain/permit-to-work';
import { type CapaAction, makeCapaAction } from './domain/capa-action';
import { type ToolboxTalk, makeToolboxTalk } from './domain/toolbox-talk';
import { type RiskAssessment, type NewRiskAssessment, makeRiskAssessment, approveRiskAssessment } from './domain/risk-assessment';
import { type SafetyTrainingRecord, type NewSafetyTrainingRecord, makeSafetyTrainingRecord, SAFETY_TRAINING_EVENT } from './domain/safety-training';

export const INCIDENT_STORE = Symbol('INCIDENT_STORE');
export const PTW_STORE = Symbol('PTW_STORE');
export const CAPA_STORE = Symbol('CAPA_STORE');
export const TOOLBOX_STORE = Symbol('TOOLBOX_STORE');
export const RISK_ASSESSMENT_STORE = Symbol('RISK_ASSESSMENT_STORE');
export const SAFETY_TRAINING_STORE = Symbol('SAFETY_TRAINING_STORE');

import {
  type HseIncidentStore,
  type PermitToWorkStore,
  type CapaActionStore,
  type ToolboxTalkStore,
  type RiskAssessmentStore,
  type SafetyTrainingStore,
} from './store.interface';

export const HSE_EVENT = {
  incidentReported: 'hse.incident.reported',
  ptwIssued: 'hse.ptw.issued',
  ptwClosed: 'hse.ptw.closed',
  capaRaised: 'hse.capa.raised',
  toolboxTalkRecorded: 'hse.toolbox_talk.recorded',
};

@Injectable()
export class HseService {
  private readonly logger = new Logger('HseControl');

  constructor(
    @Inject(INCIDENT_STORE) private readonly incidentStore: HseIncidentStore,
    @Inject(PTW_STORE) private readonly ptwStore: PermitToWorkStore,
    @Inject(CAPA_STORE) private readonly capaStore: CapaActionStore,
    @Inject(TOOLBOX_STORE) private readonly toolboxStore: ToolboxTalkStore,
    @Inject(RISK_ASSESSMENT_STORE) private readonly riskStore: RiskAssessmentStore,
    @Inject(SAFETY_TRAINING_STORE) private readonly trainingStore: SafetyTrainingStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── Incidents ──────────────────────────────────────────────────────────────

  async reportIncident(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    date: string;
    severity: HseIncident['severity'];
    description: string;
    locationDetail: string;
    createdBy?: string;
  }): Promise<HseIncident> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.incident.create', orgPath });
    }

    const incident = makeHseIncident(input);
    const event = makeEvent({
      type: HSE_EVENT.incidentReported,
      tenantId: incident.tenantId,
      companyId: incident.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'hse.incident',
      aggregateId: incident.id,
      payload: { severity: incident.severity, date: incident.date, projectId: incident.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.incidentStore.save(incident, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Incident reported: ${incident.severity} on ${incident.date} at ${incident.locationDetail}`);
    return incident;
  }

  /** reported → investigating. */
  async investigateIncident(tenantId: Id, actorId: Id | null, id: Id): Promise<HseIncident> {
    const incident = await this.incidentStore.findById(id, tenantId);
    if (!incident) throw new Error(`Incident with ID ${id} not found`);
    this.assertIncidentPermission(incident, actorId, 'hse.incident.close');

    const updated = startIncidentInvestigation(incident, actorId);
    await this.tx.run(async (handle) => { await this.incidentStore.save(updated, handle); });
    this.logger.log(`Incident investigation started: ${updated.id}`);
    return updated;
  }

  /**
   * investigating → closed, behind the CAPA gate.
   *
   * An incident cannot be closed while corrective actions raised against it are still open. This is
   * the control that stops "closed" from meaning "filed and forgotten" — the same shape of gate as
   * the commissioning punch list, and the reason the same accident does not happen twice. Root
   * cause is mandatory (enforced in the transition).
   */
  async closeIncident(tenantId: Id, actorId: Id | null, id: Id, rootCause: string): Promise<HseIncident> {
    const incident = await this.incidentStore.findById(id, tenantId);
    if (!incident) throw new Error(`Incident with ID ${id} not found`);
    this.assertIncidentPermission(incident, actorId, 'hse.incident.close');

    const openCapa = (await this.capaStore.findBySource('incident', id, tenantId)).filter(
      (c) => c.status !== 'completed',
    );
    if (openCapa.length > 0) {
      // "can only" → 409 CONFLICT under the error taxonomy, not a 500.
      throw new Error(
        `an incident can only be closed once its corrective actions are complete (${openCapa.length} still open)`,
      );
    }

    const updated = closeIncidentTransition(incident, actorId, rootCause);
    await this.tx.run(async (handle) => { await this.incidentStore.save(updated, handle); });
    this.logger.log(`Incident closed: ${updated.id}`);
    return updated;
  }

  /** closed → investigating, when new evidence lands. */
  async reopenIncident(tenantId: Id, actorId: Id | null, id: Id): Promise<HseIncident> {
    const incident = await this.incidentStore.findById(id, tenantId);
    if (!incident) throw new Error(`Incident with ID ${id} not found`);
    this.assertIncidentPermission(incident, actorId, 'hse.incident.close');

    const updated = reopenIncident(incident, actorId);
    await this.tx.run(async (handle) => { await this.incidentStore.save(updated, handle); });
    this.logger.log(`Incident reopened: ${updated.id}`);
    return updated;
  }

  /** The Incident 360: the record with the corrective actions raised against it. */
  async getIncidentDetail(
    tenantId: Id,
    id: Id,
  ): Promise<{ incident: HseIncident; capaActions: CapaAction[] } | null> {
    const incident = await this.incidentStore.findById(id, tenantId);
    if (!incident) return null;
    const capaActions = await this.capaStore.findBySource('incident', id, tenantId);
    return { incident, capaActions };
  }

  private assertIncidentPermission(incident: HseIncident, actorId: Id | null, permission: string): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: incident.tenantId }];
    if (incident.companyId) orgPath.push({ level: 'company', id: incident.companyId });
    this.access.assert(actorId, { permission, orgPath });
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listIncidents(tenantId: Id, projectId?: string): Promise<HseIncident[]> {
    const all = await this.incidentStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  listIncidentsPaged(tenantId: Id, page: PageParams): Promise<Page<HseIncident>> {
    return this.incidentStore.findAllPaged(tenantId, page);
  }

  // ── Permit To Work (PTW) ───────────────────────────────────────────────────

  async requestPermit(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    permitType: PermitToWork['permitType'];
    validFrom: string;
    validTo: string;
    description: string;
    /** The risk assessment authorising the work. Approval is refused without an approved one. */
    riskAssessmentId?: string | null;
    createdBy?: string;
  }): Promise<PermitToWork> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.ptw.request', orgPath });
    }

    const permit = makePermitToWork(input);

    await this.tx.run(async (handle) => {
      await this.ptwStore.save(permit, handle);
    });

    this.logger.log(`Permit requested: ${permit.permitType} for project ${permit.projectId}`);
    return permit;
  }

  /**
   * requested → approved: the moment high-risk work becomes authorised. Three gates stand in front
   * of it, and all three are refusals a paper permit system is supposed to make but usually cannot:
   *
   *   1. **Risk assessment** — the permit must cite a risk assessment, and that assessment must be
   *      approved. Authorising work whose hazards were never signed off is the failure this exists
   *      to prevent.
   *   2. **Segregation of duties** — the approver may not be the requester. Self-authorisation is
   *      how a permit system quietly becomes a rubber stamp.
   *   3. **Validity window** — a permit outside its own window no longer describes the conditions
   *      it was assessed against, so it cannot be issued.
   */
  async approvePermit(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (found.companyId) orgPath.push({ level: 'company', id: found.companyId });
      this.access.assert(actorId, { permission: 'hse.ptw.approve', orgPath });
    }

    // Gate 1 — an approved risk assessment must authorise this work.
    if (!found.riskAssessmentId) {
      throw new Error('a permit can only be approved when it cites a risk assessment');
    }
    const ra = await this.riskStore.findById(found.riskAssessmentId, tenantId);
    if (!ra) {
      throw new Error(`risk assessment ${found.riskAssessmentId} not found`);
    }
    if (ra.status !== 'approved') {
      throw new Error(
        `a permit can only be approved once its risk assessment is approved (${ra.reference} is '${ra.status}')`,
      );
    }

    // Gate 2 — segregation of duties: the requester cannot authorise their own permit.
    if (actorId && found.requestedBy && found.requestedBy === actorId) {
      throw new Error('a permit can only be approved by someone other than the requester');
    }

    // Gate 3 — the authorisation window must still be open.
    if (!isWithinValidity(found)) {
      throw new Error(
        `a permit can only be approved inside its validity window (${found.validFrom} → ${found.validTo})`,
      );
    }

    const permit = approvePermitTransition(found, actorId);

    const event = makeEvent({
      type: HSE_EVENT.ptwIssued,
      tenantId: permit.tenantId,
      companyId: permit.companyId,
      actorId,
      aggregateType: 'hse.ptw',
      aggregateId: permit.id,
      payload: { permitType: permit.permitType, validFrom: permit.validFrom, validTo: permit.validTo, projectId: permit.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.ptwStore.save(permit, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Permit approved & issued: ${permit.permitType} (${permit.id})`);
    return permit;
  }

  /**
   * Close a permit when the work is finished and the area is made safe — the auditable end of a
   * high-risk activity. Only an approved (issued) permit can be closed; a permit left open past its
   * window is a real safety-and-compliance liability, so this is the step that shuts it.
   */
  async closePermit(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);
    this.assertPermitPermission(found, actorId);

    const permit = closePermitTransition(found, actorId);

    const event = makeEvent({
      type: HSE_EVENT.ptwClosed,
      tenantId: permit.tenantId,
      companyId: permit.companyId,
      actorId,
      aggregateType: 'hse.ptw',
      aggregateId: permit.id,
      payload: { permitType: permit.permitType, projectId: permit.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.ptwStore.save(permit, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Permit closed: ${permit.permitType} (${permit.id})`);
    return permit;
  }

  /**
   * draft → requested. Only reachable after a rejection re-opened the permit: a permit raised
   * fresh starts life already `requested`, so this is the "corrected, ask again" step.
   */
  async requestPermitApproval(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);
    this.assertPermitPermission(found, actorId);

    const permit = requestPermitTransition(found, actorId);
    await this.tx.run(async (handle) => { await this.ptwStore.save(permit, handle); });
    return permit;
  }

  /** requested → rejected (reason mandatory), and rejected → draft to correct and re-request. */
  async rejectPermit(tenantId: Id, actorId: Id | null, id: Id, reason: string): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);
    this.assertPermitPermission(found, actorId);

    const permit = rejectPermitTransition(found, actorId, reason);
    await this.tx.run(async (handle) => { await this.ptwStore.save(permit, handle); });
    this.logger.log(`Permit rejected: ${permit.id} — ${permit.rejectionReason}`);
    return permit;
  }

  async reopenPermit(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);
    this.assertPermitPermission(found, actorId);

    const permit = reopenPermitTransition(found);
    await this.tx.run(async (handle) => { await this.ptwStore.save(permit, handle); });
    return permit;
  }

  /**
   * Retire a permit whose window has passed. Deliberately callable on a `requested` or `approved`
   * permit: an open permit past its validity is the liability, and nobody closing it does not make
   * it safe.
   */
  async expirePermit(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const found = await this.ptwStore.findById(id, tenantId);
    if (!found) throw new Error(`Permit with ID ${id} not found`);
    this.assertPermitPermission(found, actorId);

    const permit = expirePermitTransition(found);
    await this.tx.run(async (handle) => { await this.ptwStore.save(permit, handle); });
    this.logger.log(`Permit expired: ${permit.id}`);
    return permit;
  }

  /** The Permit 360: the permit with the risk assessment that authorises it. */
  async getPermitDetail(
    tenantId: Id,
    id: Id,
  ): Promise<{ permit: PermitToWork; riskAssessment: RiskAssessment | null } | null> {
    const permit = await this.ptwStore.findById(id, tenantId);
    if (!permit) return null;
    const riskAssessment = permit.riskAssessmentId
      ? await this.riskStore.findById(permit.riskAssessmentId, tenantId)
      : null;
    return { permit, riskAssessment };
  }

  private assertPermitPermission(permit: PermitToWork, actorId: Id | null): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: permit.tenantId }];
    if (permit.companyId) orgPath.push({ level: 'company', id: permit.companyId });
    this.access.assert(actorId, { permission: 'hse.ptw.approve', orgPath });
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listPermits(tenantId: Id, projectId?: string): Promise<PermitToWork[]> {
    const all = await this.ptwStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  listPermitsPaged(tenantId: Id, page: PageParams): Promise<Page<PermitToWork>> {
    return this.ptwStore.findAllPaged(tenantId, page);
  }

  // ── Toolbox Talks (daily safety briefings) ─────────────────────────────────

  async recordToolboxTalk(input: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    topic: string;
    conductedBy: string;
    talkDate: string;
    attendeeCount: number;
    notes?: string;
    createdBy?: string | null;
  }): Promise<ToolboxTalk> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.toolbox.record', orgPath });
    }

    const talk = makeToolboxTalk(input);
    const event = makeEvent({
      type: HSE_EVENT.toolboxTalkRecorded,
      tenantId: talk.tenantId,
      companyId: talk.companyId,
      actorId: talk.createdBy,
      aggregateType: 'hse.toolbox_talk',
      aggregateId: talk.id,
      payload: { projectId: talk.projectId, topic: talk.topic, talkDate: talk.talkDate, attendeeCount: talk.attendeeCount },
    });

    await this.tx.run(async (handle) => {
      await this.toolboxStore.save(talk, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Toolbox talk recorded: "${talk.topic}" on ${talk.talkDate} (${talk.attendeeCount} attendees)`);
    return talk;
  }

  listToolboxTalks(tenantId: Id): Promise<ToolboxTalk[]> {
    return this.toolboxStore.findAll(tenantId);
  }

  // ── Corrective & Preventive Action (CAPA) ──────────────────────────────────

  async raiseCapa(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    sourceType: CapaAction['sourceType'];
    sourceId?: string;
    actionRequired: string;
    assignedTo?: string;
    dueDate: string;
    createdBy?: string;
  }): Promise<CapaAction> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.capa.raise', orgPath });
    }

    const capa = makeCapaAction(input);
    const event = makeEvent({
      type: HSE_EVENT.capaRaised,
      tenantId: capa.tenantId,
      companyId: capa.companyId,
      actorId: input.createdBy || null,
      aggregateType: 'hse.capa',
      aggregateId: capa.id,
      payload: { sourceType: capa.sourceType, sourceId: capa.sourceId, dueDate: capa.dueDate, projectId: capa.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.capaStore.save(capa, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`CAPA raised: due on ${capa.dueDate} for project ${capa.projectId}`);
    return capa;
  }

  async completeCapa(tenantId: Id, actorId: Id | null, id: Id): Promise<CapaAction> {
    const capa = await this.capaStore.findById(id, tenantId);
    if (!capa) throw new Error(`CAPA with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (capa.companyId) orgPath.push({ level: 'company', id: capa.companyId });
      this.access.assert(actorId, { permission: 'hse.capa.complete', orgPath });
    }

    capa.status = 'completed';
    capa.completedAt = new Date().toISOString();
    capa.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.capaStore.save(capa, handle);
    });

    this.logger.log(`CAPA completed: ${capa.id}`);
    return capa;
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listCapas(tenantId: Id, projectId?: string): Promise<CapaAction[]> {
    const all = await this.capaStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  /**
   * HSE's own verdict on a project's health — §24.
   *
   * Project 360 aggregates this; it does not compute it. Only HSE can say what its records MEAN,
   * and the distinction matters more here than anywhere: `fatal` looks obvious to any reader, and
   * that obviousness is exactly the trap. Once Projects is allowed one "obvious" reading of another
   * domain's vocabulary, it acquires a second interpretation of every domain, and the two drift.
   *
   * THE RULES, AND WHY EACH ONE
   *
   * A `fatal` or `major` incident that is not closed is CRITICAL. This domain's own closure gate
   * makes no distinction between the two — both need a root cause and no open corrective actions
   * before they can be closed — so both are treated as the highest condition HSE has while open.
   *
   * An OVERDUE corrective action is AT_RISK, whatever the incident that produced it. CAPA is the
   * control that stops the same accident happening twice, and `closeIncident` refuses while any
   * remains open. An overdue one is that control having lapsed, in the open, with a date on it.
   *
   * Anything else still open — a minor or near-miss under investigation, or a corrective action
   * inside its due date — is WATCH. Worth knowing; not yet a call to act.
   *
   * NO INCIDENTS IS `CLEAR`, NOT `NOT_APPLICABLE`. Commissioning may legitimately not apply to a
   * project that has nothing to commission. HSE always applies wherever people work, so an empty
   * register is a result, not an absence — and reporting it as inapplicable would quietly excuse
   * a project from the one domain nobody may be excused from.
   *
   * These thresholds are HSE's, and HSE changes them here. Projects will report whatever this
   * returns without reinterpreting it.
   */
  async readProjectHseHealth(tenantId: Id, projectId: Id, today = new Date().toISOString().slice(0, 10)): Promise<HealthSignal> {
    const href = `/project/${encodeURIComponent(projectId)}/workspace/hse`;
    const [incidents, capas] = await Promise.all([this.listIncidents(tenantId), this.listCapas(tenantId)]);

    const mine = incidents.filter((i) => i.projectId === projectId);
    const open = mine.filter((i) => i.status !== 'closed');
    const serious = open.filter((i) => i.severity === 'fatal' || i.severity === 'major');

    const myCapas = capas.filter((c) => c.projectId === projectId);
    const openCapas = myCapas.filter((c) => c.status !== 'completed');
    const overdueCapas = openCapas.filter((c) => c.dueDate < today);

    if (serious.length > 0) {
      const fatal = serious.filter((i) => i.severity === 'fatal').length;
      const detail = fatal > 0
        ? `${fatal} fatal incident${fatal === 1 ? '' : 's'} under investigation`
        : `${serious.length} major incident${serious.length === 1 ? '' : 's'} under investigation`;
      return { id: 'hse-exposure', domain: 'hse', state: 'CRITICAL', reason: `${detail}.`, href, measure: { value: serious.length } };
    }

    if (overdueCapas.length > 0) {
      return {
        id: 'hse-exposure',
        domain: 'hse',
        state: 'AT_RISK',
        reason: `${overdueCapas.length} corrective action${overdueCapas.length === 1 ? '' : 's'} overdue — the control that prevents recurrence has lapsed.`,
        href,
        measure: { value: overdueCapas.length },
      };
    }

    if (open.length > 0 || openCapas.length > 0) {
      const parts = [
        ...(open.length > 0 ? [`${open.length} incident${open.length === 1 ? '' : 's'} under investigation`] : []),
        ...(openCapas.length > 0 ? [`${openCapas.length} corrective action${openCapas.length === 1 ? '' : 's'} open`] : []),
      ];
      return { id: 'hse-exposure', domain: 'hse', state: 'WATCH', reason: `${parts.join(', ')}.`, href, measure: { value: open.length + openCapas.length } };
    }

    return { id: 'hse-exposure', domain: 'hse', state: 'CLEAR' };
  }

  // ── Risk assessments (JSA) ──────────────────────────────────────────────────

  async createRiskAssessment(input: NewRiskAssessment): Promise<RiskAssessment> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.risk_assessment.create', orgPath });
    }
    const ra = makeRiskAssessment(input);
    await this.tx.run(async (handle) => { await this.riskStore.save(ra, handle); });
    this.logger.log(`Risk assessment ${ra.reference} for "${ra.activity}": residual ${ra.residualScore} (${ra.residualBand})`);
    return ra;
  }

  async approveRiskAssessment(tenantId: Id, id: Id): Promise<RiskAssessment> {
    const ra = await this.riskStore.findById(id, tenantId);
    if (!ra) throw new Error(`risk assessment ${id} not found`);
    const updated = approveRiskAssessment(ra);
    await this.tx.run(async (handle) => { await this.riskStore.save(updated, handle); });
    return updated;
  }

  getRiskAssessment(tenantId: Id, id: Id): Promise<RiskAssessment | null> {
    return this.riskStore.findById(id, tenantId);
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listRiskAssessments(tenantId: Id, projectId?: string): Promise<RiskAssessment[]> {
    const all = await this.riskStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  // ── Safety Training Matrix ──────────────────────────────────────────────────

  async recordSafetyTraining(input: NewSafetyTrainingRecord): Promise<SafetyTrainingRecord> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'hse.training.record', orgPath });
    }

    const record = makeSafetyTrainingRecord(input);
    const event = makeEvent({
      type: SAFETY_TRAINING_EVENT.recorded,
      tenantId: record.tenantId,
      companyId: record.companyId,
      actorId: record.createdBy,
      aggregateType: 'hse.safety_training',
      aggregateId: record.id,
      payload: { workerId: record.workerId, workerName: record.workerName, status: record.status },
    });

    await this.tx.run(async (handle) => {
      await this.trainingStore.save(record, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Safety training record saved for ${record.workerName} (${record.workerId}): status ${record.status}`);
    return record;
  }

  listSafetyTraining(tenantId: Id): Promise<SafetyTrainingRecord[]> {
    return this.trainingStore.findAll(tenantId);
  }

  getSafetyTrainingForWorker(tenantId: Id, workerId: string): Promise<SafetyTrainingRecord[]> {
    return this.trainingStore.findByWorker(workerId, tenantId);
  }
}
