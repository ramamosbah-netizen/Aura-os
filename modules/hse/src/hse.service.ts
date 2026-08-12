import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, type Page, type PageParams, makeEvent } from '@aura/shared';
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

  listIncidents(tenantId: Id): Promise<HseIncident[]> {
    return this.incidentStore.findAll(tenantId);
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

  listPermits(tenantId: Id): Promise<PermitToWork[]> {
    return this.ptwStore.findAll(tenantId);
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

  listCapas(tenantId: Id): Promise<CapaAction[]> {
    return this.capaStore.findAll(tenantId);
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

  listRiskAssessments(tenantId: Id): Promise<RiskAssessment[]> {
    return this.riskStore.findAll(tenantId);
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
