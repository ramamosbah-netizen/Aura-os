import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent, type Page, type PageParams } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Ncr, makeNcr } from './domain/ncr';
import { type InspectionRequest, makeInspectionRequest } from './domain/inspection-request';
import { type Snag, makeSnag } from './domain/snag';
import { type Itp, type PointResult, makeItp, activateItp, recordPointResult, closeItp } from './domain/itp';
import {
  type MaterialApproval,
  type NewMaterialApproval,
  type MarDecision,
  makeMaterialApproval,
  submitMaterialApproval,
  reviewMaterialApproval,
  reviseMaterialApproval,
} from './domain/material-approval';

import { type Calibration, type NewCalibration, makeCalibration, calibrationStatus } from './domain/calibration';
import { type AuditSchedule, type ChecklistItem, type NewAuditSchedule, makeAuditSchedule, QUALITY_AUDIT_EVENT } from './domain/audit-schedule';

export const NCR_STORE = Symbol('NCR_STORE');
export const INSPECTION_REQUEST_STORE = Symbol('INSPECTION_REQUEST_STORE');
export const SNAG_STORE = Symbol('SNAG_STORE');
export const ITP_STORE = Symbol('ITP_STORE');
export const MATERIAL_APPROVAL_STORE = Symbol('MATERIAL_APPROVAL_STORE');
export const CALIBRATION_STORE = Symbol('CALIBRATION_STORE');
export const AUDIT_SCHEDULE_STORE = Symbol('AUDIT_SCHEDULE_STORE');

import {
  type NcrStore,
  type InspectionRequestStore,
  type SnagStore,
  type ItpStore,
  type MaterialApprovalStore,
  type CalibrationStore,
  type AuditScheduleStore,
  type MaterialApprovalFilter,
} from './store.interface';

export const QUALITY_EVENT = {
  ncrRaised: 'quality.ncr.raised',
  irApproved: 'quality.ir.approved',
  snagClosed: 'quality.snag.closed',
  itpCreated: 'quality.itp.created',
  itpClosed: 'quality.itp.closed',
  marCreated: 'quality.material_approval.created',
  marSubmitted: 'quality.material_approval.submitted',
  marReviewed: 'quality.material_approval.reviewed',
  marRevised: 'quality.material_approval.revised',
};

@Injectable()
export class QualityService {
  private readonly logger = new Logger('QualityControl');

  constructor(
    @Inject(NCR_STORE) private readonly ncrStore: NcrStore,
    @Inject(INSPECTION_REQUEST_STORE) private readonly irStore: InspectionRequestStore,
    @Inject(SNAG_STORE) private readonly snagStore: SnagStore,
    @Inject(ITP_STORE) private readonly itpStore: ItpStore,
    @Inject(MATERIAL_APPROVAL_STORE) private readonly marStore: MaterialApprovalStore,
    @Inject(CALIBRATION_STORE) private readonly calibrationStore: CalibrationStore,
    @Inject(AUDIT_SCHEDULE_STORE) private readonly auditStore: AuditScheduleStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
  ) {}

  // ── NCR (Non-Conformance Reports) ──────────────────────────────────────────

  async raiseNcr(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    ncrNumber: string;
    description: string;
    rootCause?: string;
    proposedCorrection?: string;
    severity: Ncr['severity'];
    raisedBy?: string;
    assignedTo?: string;
  }): Promise<Ncr> {
    if (input.raisedBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.raisedBy, { permission: 'quality.ncr.create', orgPath });
    }

    const ncr = makeNcr(input);
    const event = makeEvent({
      type: QUALITY_EVENT.ncrRaised,
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      actorId: input.raisedBy || null,
      aggregateType: 'quality.ncr',
      aggregateId: ncr.id,
      payload: { severity: ncr.severity, ncrNumber: ncr.ncrNumber, projectId: ncr.projectId },
    });

    await this.tx.run(async (handle) => {
      await this.ncrStore.save(ncr, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`NCR raised: ${ncr.ncrNumber} (${ncr.severity}) on project ${ncr.projectId}`);
    return ncr;
  }

  async updateNcrStatus(tenantId: Id, actorId: Id | null, id: Id, status: Ncr['status'], rootCause?: string, proposedCorrection?: string): Promise<Ncr> {
    const ncr = await this.ncrStore.findById(id, tenantId);
    if (!ncr) throw new Error(`NCR with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ncr.companyId) orgPath.push({ level: 'company', id: ncr.companyId });
      this.access.assert(actorId, { permission: 'quality.ncr.close', orgPath });
    }

    ncr.status = status;
    if (rootCause) ncr.rootCause = rootCause;
    if (proposedCorrection) ncr.proposedCorrection = proposedCorrection;
    ncr.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.ncrStore.save(ncr, handle);
    });

    this.logger.log(`NCR ${ncr.ncrNumber} status changed to ${status}`);
    return ncr;
  }

  listNcrs(tenantId: Id): Promise<Ncr[]> {
    return this.ncrStore.findAll(tenantId);
  }

  // ── Inspection Requests (IR) ────────────────────────────────────────────────

  async requestInspection(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    irNumber: string;
    discipline: InspectionRequest['discipline'];
    locationDetail: string;
    inspectionDate: string;
    inspectedBy?: string;
  }): Promise<InspectionRequest> {
    if (input.inspectedBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.inspectedBy, { permission: 'quality.ir.request', orgPath });
    }

    const ir = makeInspectionRequest(input);

    await this.tx.run(async (handle) => {
      await this.irStore.save(ir, handle);
    });

    this.logger.log(`Inspection requested: ${ir.irNumber} (${ir.discipline}) for project ${ir.projectId}`);
    return ir;
  }

  async resolveInspection(tenantId: Id, actorId: Id | null, id: Id, status: 'approved' | 'rejected', comments?: string): Promise<InspectionRequest> {
    const ir = await this.irStore.findById(id, tenantId);
    if (!ir) throw new Error(`Inspection Request with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ir.companyId) orgPath.push({ level: 'company', id: ir.companyId });
      this.access.assert(actorId, { permission: 'quality.ir.approve', orgPath });
    }

    ir.status = status;
    ir.inspectedBy = actorId;
    if (comments) ir.comments = comments;
    ir.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.irStore.save(ir, handle);
      if (status === 'approved') {
        const event = makeEvent({
          type: QUALITY_EVENT.irApproved,
          tenantId: ir.tenantId,
          companyId: ir.companyId,
          actorId,
          aggregateType: 'quality.ir',
          aggregateId: ir.id,
          payload: { irNumber: ir.irNumber, discipline: ir.discipline, projectId: ir.projectId },
        });
        await this.events.appendWithClient(handle, [event]);
      }
    });

    this.logger.log(`Inspection ${ir.irNumber} ${status}`);
    return ir;
  }

  listInspections(tenantId: Id): Promise<InspectionRequest[]> {
    return this.irStore.findAll(tenantId);
  }

  // ── Snagging / Punch List ──────────────────────────────────────────────────

  async logSnag(input: {
    tenantId: string;
    companyId?: string;
    projectId: string;
    projectName?: string;
    description: string;
    locationDetail: string;
    severity: Snag['severity'];
    createdBy?: string;
    assignedTo?: string;
  }): Promise<Snag> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.snag.create', orgPath });
    }

    const snag = makeSnag(input);

    await this.tx.run(async (handle) => {
      await this.snagStore.save(snag, handle);
    });

    this.logger.log(`Snag logged: ${snag.description} (${snag.severity}) at ${snag.locationDetail}`);
    return snag;
  }

  async resolveSnag(tenantId: Id, actorId: Id | null, id: Id, status: 'resolved' | 'closed'): Promise<Snag> {
    const snag = await this.snagStore.findById(id, tenantId);
    if (!snag) throw new Error(`Snag with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (snag.companyId) orgPath.push({ level: 'company', id: snag.companyId });
      this.access.assert(actorId, { permission: 'quality.snag.resolve', orgPath });
    }

    snag.status = status;
    if (status === 'resolved') {
      snag.resolvedAt = new Date().toISOString();
    }
    snag.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.snagStore.save(snag, handle);
      if (status === 'closed') {
        const event = makeEvent({
          type: QUALITY_EVENT.snagClosed,
          tenantId: snag.tenantId,
          companyId: snag.companyId,
          actorId,
          aggregateType: 'quality.snag',
          aggregateId: snag.id,
          payload: { description: snag.description, projectId: snag.projectId },
        });
        await this.events.appendWithClient(handle, [event]);
      }
    });

    this.logger.log(`Snag ${snag.id} marked as ${status}`);
    return snag;
  }

  listSnags(tenantId: Id): Promise<Snag[]> {
    return this.snagStore.findAll(tenantId);
  }

  // ── Inspection & Test Plans (ITP) ──────────────────────────────────────────

  async createItp(input: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    reference: string;
    title: string;
    discipline?: string;
    points: Array<{ activity: string; pointType: 'hold' | 'witness' | 'review' | 'surveillance'; acceptanceCriteria?: string }>;
    createdBy?: string | null;
  }): Promise<Itp> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.itp.create', orgPath });
    }
    const itp = makeItp(input);
    const event = makeEvent({
      type: QUALITY_EVENT.itpCreated,
      tenantId: itp.tenantId, companyId: itp.companyId, actorId: itp.createdBy,
      aggregateType: 'quality.itp', aggregateId: itp.id,
      payload: { reference: itp.reference, projectId: itp.projectId, points: itp.points.length },
    });
    await this.tx.run(async (handle) => {
      await this.itpStore.save(itp, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`ITP created: ${itp.reference} (${itp.points.length} points)`);
    return itp;
  }

  async activateItp(tenantId: Id, id: Id): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    const updated = activateItp(itp);
    await this.tx.run(async (handle) => { await this.itpStore.save(updated, handle); });
    return updated;
  }

  async recordItpPoint(tenantId: Id, id: Id, pointIndex: number, result: PointResult): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    const updated = recordPointResult(itp, pointIndex, result);
    await this.tx.run(async (handle) => { await this.itpStore.save(updated, handle); });
    return updated;
  }

  async closeItp(tenantId: Id, id: Id): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    const updated = closeItp(itp);
    const event = makeEvent({
      type: QUALITY_EVENT.itpClosed,
      tenantId, companyId: itp.companyId, actorId: null,
      aggregateType: 'quality.itp', aggregateId: id,
      payload: { reference: itp.reference },
    });
    await this.tx.run(async (handle) => {
      await this.itpStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  listItps(tenantId: Id): Promise<Itp[]> {
    return this.itpStore.findAll(tenantId);
  }

  // ── Material Approval Requests (MAR) ───────────────────────────────────────

  async createMaterialApproval(input: NewMaterialApproval): Promise<MaterialApproval> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.mar.create', orgPath });
    }
    const mar = makeMaterialApproval(input);
    const event = makeEvent({
      type: QUALITY_EVENT.marCreated,
      tenantId: mar.tenantId, companyId: mar.companyId, actorId: mar.createdBy,
      aggregateType: 'quality.material_approval', aggregateId: mar.id,
      payload: { reference: mar.reference, projectId: mar.projectId, material: mar.materialName },
    });
    await this.tx.run(async (handle) => {
      await this.marStore.save(mar, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`MAR created: ${mar.reference} — ${mar.materialName}`);
    return mar;
  }

  async submitMaterialApproval(tenantId: Id, id: Id): Promise<MaterialApproval> {
    const mar = await this.marStore.findById(id, tenantId);
    if (!mar) throw new Error(`MAR ${id} not found`);
    const updated = submitMaterialApproval(mar);
    const event = makeEvent({
      type: QUALITY_EVENT.marSubmitted,
      tenantId, companyId: mar.companyId, actorId: null,
      aggregateType: 'quality.material_approval', aggregateId: id,
      payload: { reference: mar.reference, revision: updated.revision },
    });
    await this.tx.run(async (handle) => {
      await this.marStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  async reviewMaterialApproval(tenantId: Id, id: Id, decision: MarDecision, reviewedBy: Id | null, comments?: string): Promise<MaterialApproval> {
    const mar = await this.marStore.findById(id, tenantId);
    if (!mar) throw new Error(`MAR ${id} not found`);
    const updated = reviewMaterialApproval(mar, decision, reviewedBy, comments);
    const event = makeEvent({
      type: QUALITY_EVENT.marReviewed,
      tenantId, companyId: mar.companyId, actorId: reviewedBy,
      aggregateType: 'quality.material_approval', aggregateId: id,
      payload: { reference: mar.reference, decision, material: mar.materialName },
    });
    await this.tx.run(async (handle) => {
      await this.marStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`MAR ${mar.reference} reviewed: ${decision}`);
    return updated;
  }

  async reviseMaterialApproval(tenantId: Id, id: Id): Promise<MaterialApproval> {
    const mar = await this.marStore.findById(id, tenantId);
    if (!mar) throw new Error(`MAR ${id} not found`);
    const updated = reviseMaterialApproval(mar);
    await this.tx.run(async (handle) => { await this.marStore.save(updated, handle); });
    return updated;
  }

  listMaterialApprovals(tenantId: Id): Promise<MaterialApproval[]> {
    return this.marStore.findAll(tenantId);
  }

  listMaterialApprovalsPaged(filter: MaterialApprovalFilter, page: PageParams): Promise<Page<MaterialApproval>> {
    return this.marStore.listPaged(filter, page);
  }

  /**
   * Quality hard gate for Procurement PO issuance.
   * Checks if the given supplier has any **rejected** MARs on the project.
   * Returns `{ passed: true }` if clear, or `{ passed: false, reason }` if blocked.
   */
  async checkMaterialApprovalGate(
    tenantId: string,
    projectId: string,
    supplierName: string,
  ): Promise<{ passed: boolean; rejectedMars?: string[]; reason?: string }> {
    if (!projectId || !supplierName) return { passed: true };
    const mars = await this.marStore.findByProject(projectId, tenantId);
    const rejected = mars.filter(
      (m) => m.status === 'rejected' && m.supplier.toLowerCase() === supplierName.toLowerCase(),
    );
    if (rejected.length > 0) {
      const refs = rejected.map((m) => m.reference);
      return {
        passed: false,
        rejectedMars: refs,
        reason: `Supplier "${supplierName}" has ${rejected.length} rejected Material Approval Request(s) on this project: ${refs.join(', ')}`,
      };
    }
    return { passed: true };
  }

  // ── Equipment calibration ──────────────────────────────────────────────────

  async recordCalibration(input: NewCalibration): Promise<Calibration> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.calibration.create', orgPath });
    }
    const cal = makeCalibration(input);
    await this.tx.run(async (handle) => { await this.calibrationStore.save(cal, handle); });
    this.logger.log(`Calibration recorded: ${cal.equipmentName} (${cal.equipmentSerial}) due ${cal.dueDate} [${cal.status}]`);
    return cal;
  }

  getCalibration(tenantId: Id, id: Id): Promise<Calibration | null> {
    return this.calibrationStore.findById(id, tenantId);
  }

  /** All calibration records for a tenant, with `status` recomputed against today. */
  async listCalibrations(tenantId: Id): Promise<Calibration[]> {
    const all = await this.calibrationStore.findAll(tenantId);
    return all.map((c) => ({ ...c, status: calibrationStatus(c.dueDate) }));
  }

  // ── ISO Checklists & Audits ───────────────────────────────────────────────

  async scheduleAudit(actorId: string | null, input: NewAuditSchedule): Promise<AuditSchedule> {
    if (actorId && this.access) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'quality.calibration.create', orgPath });
    }

    const audit = makeAuditSchedule(input);
    const event = makeEvent({
      type: QUALITY_AUDIT_EVENT.created,
      tenantId: audit.tenantId,
      companyId: audit.companyId,
      actorId,
      aggregateType: 'quality.audit',
      aggregateId: audit.id,
      payload: { auditNumber: audit.auditNumber, auditType: audit.auditType, scheduledDate: audit.scheduledDate },
    });

    await this.tx.run(async (handle) => {
      await this.auditStore.save(audit, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Audit schedule created: ${audit.auditNumber} (${audit.auditType}) by ${audit.auditorName}`);
    return audit;
  }

  getAudit(tenantId: string, id: string): Promise<AuditSchedule | null> {
    return this.auditStore.findById(id, tenantId);
  }

  listAudits(tenantId: string): Promise<AuditSchedule[]> {
    return this.auditStore.findAll(tenantId);
  }

  async updateAuditChecklist(
    tenantId: string,
    id: string,
    checklist: ChecklistItem[],
    status?: AuditSchedule['status'],
  ): Promise<AuditSchedule> {
    const audit = await this.auditStore.findById(id, tenantId);
    if (!audit) throw new Error(`Audit schedule with ID ${id} not found`);

    audit.checklist = checklist;
    if (status) {
      audit.status = status;
    }
    audit.updatedAt = new Date().toISOString();

    await this.auditStore.save(audit);
    return audit;
  }

  async generateNcrFromFailedCheck(
    tenantId: string,
    actorId: string | null,
    auditId: string,
    itemIndex: number,
  ): Promise<Ncr> {
    const audit = await this.auditStore.findById(auditId, tenantId);
    if (!audit) throw new Error(`Audit schedule with ID ${auditId} not found`);

    const item = audit.checklist[itemIndex];
    if (!item) throw new Error(`Checklist item at index ${itemIndex} not found`);
    if (item.status !== 'non_compliant') {
      throw new Error(`Checklist item must be non_compliant to spawn NCR`);
    }
    if (item.ncrId) {
      const existing = await this.ncrStore.findById(item.ncrId, tenantId);
      if (existing) return existing;
    }

    const ncrCount = (await this.ncrStore.findAll(tenantId)).length;
    const ncrNumber = `NCR-AUD-${String(ncrCount + 1).padStart(3, '0')}`;

    const ncr = makeNcr({
      tenantId,
      companyId: audit.companyId,
      projectId: audit.projectId,
      projectName: audit.projectName,
      ncrNumber,
      description: `Failed ISO Audit checklist item: "${item.question}" (Standard: ${item.standard}). Findings: ${item.findings ?? 'None specified'}.`,
      severity: 'minor',
      raisedBy: actorId,
    });

    item.ncrId = ncr.id;
    audit.updatedAt = new Date().toISOString();

    const event = makeEvent({
      type: 'quality.ncr.raised',
      tenantId,
      companyId: ncr.companyId,
      actorId,
      aggregateType: 'quality.ncr',
      aggregateId: ncr.id,
      payload: { ncrNumber: ncr.ncrNumber, severity: ncr.severity, auditId },
    });

    await this.tx.run(async (handle) => {
      await this.ncrStore.save(ncr, handle);
      await this.auditStore.save(audit, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.warn(`Non-conformance ticket ${ncr.ncrNumber} auto-generated from failed audit check: ${item.question}`);
    return ncr;
  }
}
