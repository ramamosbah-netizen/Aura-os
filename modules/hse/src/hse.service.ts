import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type HseIncident, makeHseIncident } from './domain/hse-incident';
import { type PermitToWork, makePermitToWork } from './domain/permit-to-work';
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

  async closeIncident(tenantId: Id, actorId: Id | null, id: Id): Promise<HseIncident> {
    const incident = await this.incidentStore.findById(id, tenantId);
    if (!incident) throw new Error(`Incident with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (incident.companyId) orgPath.push({ level: 'company', id: incident.companyId });
      this.access.assert(actorId, { permission: 'hse.incident.close', orgPath });
    }

    incident.status = 'closed';
    incident.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.incidentStore.save(incident, handle);
    });

    this.logger.log(`Incident closed: ${incident.id}`);
    return incident;
  }

  listIncidents(tenantId: Id): Promise<HseIncident[]> {
    return this.incidentStore.findAll(tenantId);
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

  async approvePermit(tenantId: Id, actorId: Id | null, id: Id): Promise<PermitToWork> {
    const permit = await this.ptwStore.findById(id, tenantId);
    if (!permit) throw new Error(`Permit with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (permit.companyId) orgPath.push({ level: 'company', id: permit.companyId });
      this.access.assert(actorId, { permission: 'hse.ptw.approve', orgPath });
    }

    permit.status = 'approved';
    permit.approvedBy = actorId;
    permit.approvedAt = new Date().toISOString();
    permit.updatedAt = new Date().toISOString();

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

  listPermits(tenantId: Id): Promise<PermitToWork[]> {
    return this.ptwStore.findAll(tenantId);
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
