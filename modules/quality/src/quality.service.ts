import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type HealthSignal, type Id, type OrgLevel, makeEvent, type Page, type PageParams } from '@aura/shared';
import { ProjectResolverRegistry, AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Ncr, makeNcr, planNcrAction, markNcrCorrected, verifyNcr, escalateNcr, ncrOverdue } from './domain/ncr';
import {
  type NcrEvidence, type NcrEvidenceCategory, type NcrEvidenceStage,
  makeNcrEvidence, ncrEvidenceCoverage,
} from './domain/ncr-evidence';
import { makeNcrVerification } from './domain/ncr-verification';
import { type InspectionRequest, makeInspectionRequest, assertInspectionTransition } from './domain/inspection-request';
import {
  type IrEvidence,
  inspectionResultHash,
  makeIrEvidence,
  resolveInspectionSignature,
  signedInspectionResult,
} from './domain/ir-evidence';
import { type Snag, makeSnag, resolveSnag, closeSnag } from './domain/snag';
import { type Itp, type PointResult, makeItp, activateItp, recordPointResult, closeItp, allPointsResolved } from './domain/itp';
import {
  type MaterialApproval,
  type NewMaterialApproval,
  type MarDecision,
  makeMaterialApproval,
  submitMaterialApproval,
  reviewMaterialApproval,
  reviseMaterialApproval,
} from './domain/material-approval';
import { supplierMaterialStanding, type SupplierMaterialStanding } from './domain/supplier-material-standing';

import { type Calibration, type NewCalibration, makeCalibration, calibrationStatus } from './domain/calibration';
import { type AuditSchedule, type ChecklistItem, type NewAuditSchedule, makeAuditSchedule, QUALITY_AUDIT_EVENT } from './domain/audit-schedule';

export const NCR_STORE = Symbol('NCR_STORE');
export const NCR_VERIFICATION_STORE = Symbol('NCR_VERIFICATION_STORE');
export const INSPECTION_REQUEST_STORE = Symbol('INSPECTION_REQUEST_STORE');
export const SNAG_STORE = Symbol('SNAG_STORE');
export const ITP_STORE = Symbol('ITP_STORE');
export const MATERIAL_APPROVAL_STORE = Symbol('MATERIAL_APPROVAL_STORE');
export const CALIBRATION_STORE = Symbol('CALIBRATION_STORE');
export const AUDIT_SCHEDULE_STORE = Symbol('AUDIT_SCHEDULE_STORE');

import {
  type NcrStore,
  type NcrVerificationStore,
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
  ncrActionPlanned: 'quality.ncr.action_planned',
  ncrCorrected: 'quality.ncr.corrected',
  ncrClosed: 'quality.ncr.closed',
  ncrReopened: 'quality.ncr.reopened',
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
    @Inject(NCR_VERIFICATION_STORE) private readonly ncrVerificationStore: NcrVerificationStore,
    @Inject(INSPECTION_REQUEST_STORE) private readonly irStore: InspectionRequestStore,
    @Inject(SNAG_STORE) private readonly snagStore: SnagStore,
    @Inject(ITP_STORE) private readonly itpStore: ItpStore,
    @Inject(MATERIAL_APPROVAL_STORE) private readonly marStore: MaterialApprovalStore,
    @Inject(CALIBRATION_STORE) private readonly calibrationStore: CalibrationStore,
    @Inject(AUDIT_SCHEDULE_STORE) private readonly auditStore: AuditScheduleStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    @Optional() @Inject(ProjectResolverRegistry) private readonly projectScope: ProjectResolverRegistry | null = null,
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
    severity: Ncr['severity'];
    /** The ELV system the non-conformance is against; drives the Project 360 discipline lens. */
    system?: string;
    raisedBy?: string;
    assignedTo?: string;
    sourceIrId?: string;
    sourceIrNumber?: string;
    /** When the correction is due. Optional — an undated NCR cannot be overdue. */
    dueAt?: string | null;
  }): Promise<Ncr> {
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.raisedBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.raisedBy, { permission: 'quality.ncr.create', orgPath, resource: { type: 'project', id: input.projectId } });
    }

    const ncr = makeNcr(input);
    const event = makeEvent({
      type: QUALITY_EVENT.ncrRaised,
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      actorId: input.raisedBy || null,
      aggregateType: 'quality.ncr',
      aggregateId: ncr.id,
      payload: { severity: ncr.severity, ncrNumber: ncr.ncrNumber, projectId: ncr.projectId, sourceIrId: ncr.sourceIrId },
    });

    await this.tx.run(async (handle) => {
      await this.ncrStore.save(ncr, handle);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`NCR raised: ${ncr.ncrNumber} (${ncr.severity}) on project ${ncr.projectId}`);
    return ncr;
  }

  private async loadNcr(tenantId: Id, id: Id): Promise<Ncr> {
    const ncr = await this.ncrStore.findById(id, tenantId);
    if (!ncr) throw new Error(`NCR with ID ${id} not found`);
    return ncr;
  }

  /**
   * Authorise an NCR action against the project the NCR belongs to.
   *
   * Without the project on the target only an ORG grant can satisfy it, so a QA/QC member holding
   * `quality.*` was refused every NCR transition on their own project — and told the permission
   * was missing when it was the scope. Taken from the RECORD, so it cannot be misstated; an org
   * grant matches by `orgPath` and is unaffected.
   */
  private assertNcrPerm(
    actorId: Id | null,
    tenantId: Id,
    companyId: string | null,
    permission: string,
    projectId: Id,
  ): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    this.access.assert(actorId, {
      permission,
      orgPath,
      resource: { type: 'project', id: projectId },
    });
  }

  private async saveNcrWithEvent(ncr: Ncr, actorId: Id | null, type: string): Promise<Ncr> {
    const event = makeEvent({
      type,
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      actorId,
      aggregateType: 'quality.ncr',
      aggregateId: ncr.id,
      payload: { ncrNumber: ncr.ncrNumber, status: ncr.status, projectId: ncr.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.ncrStore.save(ncr, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`NCR ${ncr.ncrNumber} → ${ncr.status}`);
    return ncr;
  }

  /** raised → action_planned. Records root cause + corrective action + owner. */
  async planNcrAction(
    tenantId: Id,
    actorId: Id | null,
    id: Id,
    input: { rootCause: string; correctiveAction: string; assignedTo?: string | null },
  ): Promise<Ncr> {
    const ncr = await this.loadNcr(tenantId, id);
    this.assertNcrPerm(actorId, tenantId, ncr.companyId, 'quality.ncr.plan', ncr.projectId);
    return this.saveNcrWithEvent(planNcrAction(ncr, input), actorId, QUALITY_EVENT.ncrActionPlanned);
  }

  /** action_planned → corrected. The owner marks the corrective action implemented. */
  /**
   * ESCALATE AN OVERDUE CORRECTION.
   *
   * Refused unless the NCR really is overdue — an escalation raised against something that is
   * not late is noise, and a register full of noise is one nobody reads. The domain owns that
   * judgement; this adds the authority check and the audit event.
   */
  async escalateNcr(tenantId: Id, actorId: Id | null, id: Id, reason: string): Promise<Ncr> {
    const ncr = await this.ncrStore.findById(id, tenantId);
    if (!ncr) throw new Error(`NCR with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ncr.companyId) orgPath.push({ level: 'company', id: ncr.companyId });
      this.access.assert(actorId, { permission: 'quality.ncr.verify', orgPath, resource: { type: 'project', id: ncr.projectId } });
    }
    const escalated = escalateNcr(ncr, actorId, reason);
    this.logger.log(`NCR ${ncr.ncrNumber} escalated by ${actorId ?? 'an unidentified user'}: ${escalated.escalationReason}`);
    return this.saveNcrWithEvent(escalated, actorId, QUALITY_EVENT.ncrCorrected);
  }

  /**
   * EVIDENCE, ON WHICHEVER SIDE OF THE NCR IT BELONGS TO.
   *
   * The controller stores the file, as every other upload in this repository does, so the bytes
   * are judged by the file-type policy and governed by the document access engine before they
   * reach here. `stage` is what keeps a photograph of the defect and a photograph of the repair
   * from being read as the same thing.
   */
  async addNcrEvidence(
    tenantId: Id,
    actorId: Id | null,
    id: Id,
    input: { fileId: string; stage?: NcrEvidenceStage; category?: NcrEvidenceCategory; description?: string | null; hash?: string | null; signedBy?: string | null },
  ): Promise<NcrEvidence> {
    const ncr = await this.ncrStore.findById(id, tenantId);
    if (!ncr) throw new Error(`NCR with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ncr.companyId) orgPath.push({ level: 'company', id: ncr.companyId });
      this.access.assert(actorId, { permission: 'quality.ncr.correct', orgPath, resource: { type: 'project', id: ncr.projectId } });
    }
    const evidence = makeNcrEvidence({
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      ncrId: ncr.id,
      projectId: ncr.projectId,
      fileId: input.fileId,
      stage: input.stage,
      category: input.category,
      description: input.description,
      capturedBy: actorId,
      hash: input.hash,
      signedBy: input.signedBy,
    });
    await this.ncrStore.saveEvidence(evidence);
    this.logger.log(`NCR ${ncr.ncrNumber} evidence (${evidence.stage}/${evidence.category}) recorded by ${actorId ?? 'an unidentified user'}`);
    return evidence;
  }

  /**
   * THE NCR WITH ITS EVIDENCE AND WHETHER IT IS LATE.
   *
   * `overdue` is resolved here and not by each surface: “is it late” has three answers, and a
   * screen re-deriving them would sooner or later render `undated` as on-time — which is a claim
   * nobody made.
   */
  async readNcr(tenantId: Id, id: Id): Promise<{
    ncr: Ncr;
    evidence: NcrEvidence[];
    evidenced: { raised: boolean; corrected: boolean };
    overdue: 'overdue' | 'on-time' | 'undated' | 'closed';
  } | null> {
    const ncr = await this.ncrStore.findById(id, tenantId);
    if (!ncr) return null;
    const evidence = await this.ncrStore.listEvidence(id, tenantId);
    return { ncr, evidence, evidenced: ncrEvidenceCoverage(evidence), overdue: ncrOverdue(ncr) };
  }

  async markNcrCorrected(tenantId: Id, actorId: Id | null, id: Id): Promise<Ncr> {
    const ncr = await this.loadNcr(tenantId, id);
    this.assertNcrPerm(actorId, tenantId, ncr.companyId, 'quality.ncr.correct', ncr.projectId);
    return this.saveNcrWithEvent(markNcrCorrected(ncr, actorId), actorId, QUALITY_EVENT.ncrCorrected);
  }

  /**
   * QA close-out on a corrected NCR: accepted → closed (immutable), rejected → action_planned
   * (re-correct). Records an immutable NcrVerification (rejection requires a note).
   */
  async verifyNcr(tenantId: Id, actorId: Id | null, id: Id, input: { accepted: boolean; note?: string }): Promise<Ncr> {
    const ncr = await this.loadNcr(tenantId, id);
    this.assertNcrPerm(actorId, tenantId, ncr.companyId, 'quality.ncr.close', ncr.projectId);

    const verification = makeNcrVerification({
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      ncrId: ncr.id,
      ncrNumber: ncr.ncrNumber,
      projectId: ncr.projectId,
      verifiedBy: actorId,
      outcome: input.accepted ? 'accepted' : 'rejected',
      note: input.note,
    });
    const updated = verifyNcr(ncr, input.accepted, actorId); // enforces from `corrected` only
    const type = input.accepted ? QUALITY_EVENT.ncrClosed : QUALITY_EVENT.ncrReopened;
    const event = makeEvent({
      type,
      tenantId: ncr.tenantId,
      companyId: ncr.companyId,
      actorId,
      aggregateType: 'quality.ncr',
      aggregateId: ncr.id,
      payload: { ncrNumber: ncr.ncrNumber, status: updated.status, outcome: verification.outcome, projectId: ncr.projectId },
    });
    await this.tx.run(async (handle) => {
      await this.ncrStore.save(updated, handle);
      await this.ncrVerificationStore.save(verification, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`NCR ${ncr.ncrNumber} verify ${verification.outcome} → ${updated.status}`);
    return updated;
  }

  listNcrVerifications(tenantId: Id, ncrId: Id) {
    return this.ncrVerificationStore.listByNcr(ncrId, tenantId);
  }

  getNcr(tenantId: Id, id: Id): Promise<Ncr | null> {
    return this.ncrStore.findById(id, tenantId);
  }

  /** Raise an NCR from a rejected Inspection Request — carries the IR provenance. */
  async raiseNcrFromInspection(
    tenantId: Id,
    actorId: Id | null,
    irId: Id,
    input: { ncrNumber: string; description: string; severity: Ncr['severity']; assignedTo?: string },
  ): Promise<Ncr> {
    const ir = await this.irStore.findById(irId, tenantId);
    if (!ir) throw new Error(`Inspection Request with ID ${irId} not found`);
    if (ir.status !== 'rejected') throw new Error('an NCR can only be raised from a rejected inspection');
    return this.raiseNcr({
      tenantId,
      companyId: ir.companyId ?? undefined,
      projectId: ir.projectId,
      projectName: ir.projectName ?? undefined,
      ncrNumber: input.ncrNumber,
      description: input.description,
      severity: input.severity,
      assignedTo: input.assignedTo,
      sourceIrId: ir.id,
      sourceIrNumber: ir.irNumber,
      raisedBy: actorId ?? undefined,
    });
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listNcrs(tenantId: Id, projectId?: string): Promise<Ncr[]> {
    const all = await this.ncrStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  listNcrsPaged(tenantId: Id, page: PageParams): Promise<Page<Ncr>> {
    return this.ncrStore.listPaged(tenantId, page);
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
    boqItemId?: string | null;
    approvedQuantity?: number | null;
    unit?: string | null;
  }): Promise<InspectionRequest> {
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.inspectedBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.inspectedBy, { permission: 'quality.ir.request', orgPath, resource: { type: 'project', id: input.projectId } });
    }

    const ir = makeInspectionRequest(input);

    await this.tx.run(async (handle) => {
      await this.irStore.save(ir, handle);
    });

    this.logger.log(`Inspection requested: ${ir.irNumber} (${ir.discipline}) for project ${ir.projectId}`);
    return ir;
  }

  /**
   * A PHOTOGRAPH OF WHAT WAS INSPECTED.
   *
   * Separate from the signature on purpose: photographs are gathered DURING the inspection and a
   * signature is given when it is decided. Filing them through one act would force an inspector
   * to sign before they had finished looking.
   *
   * The file is already stored and hashed by the controller, which is where every other upload in
   * this repository puts the DMS call — so the bytes are judged by the file-type policy and
   * governed by the document access engine before they reach here.
   */
  async addInspectionEvidence(
    tenantId: Id,
    actorId: Id | null,
    id: Id,
    input: { fileId: string; hash?: string | null; description?: string | null; location?: string | null; capturedAt?: string | null },
  ): Promise<IrEvidence> {
    const ir = await this.irStore.findById(id, tenantId);
    if (!ir) throw new Error(`Inspection Request with ID ${id} not found`);
    // The same authority that decides the inspection attaches its evidence. The route DECLARES
    // this rather than deriving `quality.ir.upload`, which no role holds — a route that exists,
    // looks governed and is reachable by nobody is the shape SIT-04 found in site.
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ir.companyId) orgPath.push({ level: 'company', id: ir.companyId });
      this.access.assert(actorId, { permission: 'quality.ir.resolve', orgPath, resource: { type: 'project', id: ir.projectId } });
    }
    const evidence = makeIrEvidence({
      tenantId: ir.tenantId,
      companyId: ir.companyId,
      inspectionId: ir.id,
      projectId: ir.projectId,
      fileId: input.fileId,
      category: 'photo',
      description: input.description,
      location: input.location,
      capturedAt: input.capturedAt,
      capturedBy: actorId,
      hash: input.hash,
    });
    await this.tx.run(async (handle) => {
      await this.irStore.saveEvidence(evidence, handle);
    });
    this.logger.log(`Inspection ${ir.irNumber} evidence attached by ${actorId ?? 'an unidentified user'}`);
    return evidence;
  }

  /**
   * THE INSPECTION AND WHAT IT PRODUCED, with the signature already judged against the result.
   *
   * `coverage` is resolved HERE and not by the printable sheet: that page cannot import this
   * module, and a second copy of the result hash out there would drift from this one in silence.
   */
  async readInspection(tenantId: Id, id: Id): Promise<{
    inspection: InspectionRequest;
    evidence: IrEvidence[];
    signature: (IrEvidence & { coverage: 'current' | 'superseded' | 'unverifiable' }) | null;
  } | null> {
    const inspection = await this.irStore.findById(id, tenantId);
    if (!inspection) return null;
    const evidence = await this.irStore.listEvidence(id, tenantId);
    const resolved = resolveInspectionSignature(evidence, signedInspectionResult(inspection));
    return {
      inspection,
      evidence,
      signature: resolved ? { ...resolved.evidence, coverage: resolved.coverage } : null,
    };
  }

  /** requested → in_progress. Optional "inspection started" step before a pass/fail decision. */
  async startInspection(tenantId: Id, actorId: Id | null, id: Id): Promise<InspectionRequest> {
    const ir = await this.irStore.findById(id, tenantId);
    if (!ir) throw new Error(`Inspection Request with ID ${id} not found`);
    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ir.companyId) orgPath.push({ level: 'company', id: ir.companyId });
      this.access.assert(actorId, { permission: 'quality.ir.approve', orgPath, resource: { type: 'project', id: ir.projectId } });
    }
    assertInspectionTransition(ir.status, 'in_progress');
    ir.status = 'in_progress';
    ir.inspectedBy = actorId;
    ir.updatedAt = new Date().toISOString();
    await this.tx.run(async (handle) => {
      await this.irStore.save(ir, handle);
    });
    this.logger.log(`Inspection ${ir.irNumber} started`);
    return ir;
  }

  /**
   * RESOLVE AN INSPECTION — and keep the signature that decided it.
   *
   * The screen has shown an "Inspector / Witness Signature" pad since it existed, bound to state
   * the submit payload never read, so the record of a passed inspection was a status and a name.
   *
   * The signature belongs to THIS act and not to a later one: uploaded beforehand it would cover
   * a `requested` inspection and be superseded the instant the decision landed, and attached
   * afterwards it could be added by somebody else to a decision already made.
   */
  async resolveInspection(
    tenantId: Id,
    actorId: Id | null,
    id: Id,
    status: 'approved' | 'rejected',
    comments?: string,
    signature?: { signedBy: string; fileId: string; hash: string } | null,
  ): Promise<InspectionRequest> {
    const ir = await this.irStore.findById(id, tenantId);
    if (!ir) throw new Error(`Inspection Request with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (ir.companyId) orgPath.push({ level: 'company', id: ir.companyId });
      this.access.assert(actorId, { permission: 'quality.ir.approve', orgPath, resource: { type: 'project', id: ir.projectId } });
    }

    assertInspectionTransition(ir.status, status); // fail-closed: a resolved IR cannot be re-resolved
    ir.status = status;
    ir.inspectedBy = actorId;
    if (comments) ir.comments = comments;
    ir.updatedAt = new Date().toISOString();

    await this.tx.run(async (handle) => {
      await this.irStore.save(ir, handle);

      /**
       * WHAT THE SIGNATURE COVERS is computed from the inspection AS RESOLVED, inside the same
       * transaction. A witness puts their name to the OUTCOME — this IR, this location, this
       * decision, this measured quantity — so taking the hash before the status changed would
       * bind it to an inspection that had not been decided yet.
       */
      if (signature) {
        await this.irStore.saveEvidence(makeIrEvidence({
          tenantId: ir.tenantId,
          companyId: ir.companyId,
          inspectionId: ir.id,
          projectId: ir.projectId,
          fileId: signature.fileId,
          category: 'signature',
          description: `Inspection ${status} — signed`,
          // WHO SIGNED, and separately WHO RECORDED IT. `inspectedBy` above is the AURA user who
          // resolved the inspection; this is whoever actually signed, and on a witnessed
          // inspection that is a consultant with no account here.
          signedBy: signature.signedBy,
          capturedBy: actorId,
          hash: signature.hash,
          signedContentHash: inspectionResultHash(signedInspectionResult(ir)),
          capturedAt: ir.updatedAt,
        }), handle);
      }

      if (status === 'approved') {
        const event = makeEvent({
          type: QUALITY_EVENT.irApproved,
          tenantId: ir.tenantId,
          companyId: ir.companyId,
          actorId,
          aggregateType: 'quality.ir',
          aggregateId: ir.id,
          // BOQ coding → the Quantity Ledger accrues APPROVED quantity on this measured line.
          payload: { irNumber: ir.irNumber, discipline: ir.discipline, projectId: ir.projectId, boqItemId: ir.boqItemId, approvedQuantity: ir.approvedQuantity, unit: ir.unit },
        });
        await this.events.appendWithClient(handle, [event]);
      }
    });

    this.logger.log(`Inspection ${ir.irNumber} ${status}`);
    return ir;
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listInspections(tenantId: Id, projectId?: string): Promise<InspectionRequest[]> {
    const all = await this.irStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  listInspectionsPaged(tenantId: Id, page: PageParams): Promise<Page<InspectionRequest>> {
    return this.irStore.listPaged(tenantId, page);
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
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.snag.create', orgPath, resource: { type: 'project', id: input.projectId } });
    }

    const snag = makeSnag(input);

    await this.tx.run(async (handle) => {
      await this.snagStore.save(snag, handle);
    });

    this.logger.log(`Snag logged: ${snag.description} (${snag.severity}) at ${snag.locationDetail}`);
    return snag;
  }

  /**
   * Move a snag through its lifecycle.
   *
   * THIS USED TO ASSIGN TO THE RECORD IN PLACE — `snag.status = status` — with no transition
   * function anywhere in the domain and one permission (`quality.snag.resolve`) covering both acts.
   * Measured against the running API: `PUT :id/close` returned 200 and then `PUT :id/resolve`
   * returned 200 on the same snag, walking a CLOSED defect backwards into 'resolved'. Closing set
   * no actor and no timestamp and did not even stamp `resolved_at` on the way past.
   *
   * Now: the domain owns the transition and refuses an illegal one (409), each act asks for its own
   * permission — claiming a fix and accepting one are different judgements — and both record who.
   *
   * NO RAISER/CLOSER SEPARATION, deliberately. On site the inspector who found the defect is the
   * right person to verify the fix; a rule against it would block normal practice rather than
   * control anything. What was missing was the trail, not a second pair of hands.
   */
  async resolveSnag(tenantId: Id, actorId: Id | null, id: Id, status: 'resolved' | 'closed'): Promise<Snag> {
    const found = await this.snagStore.findById(id, tenantId);
    if (!found) throw new Error(`Snag with ID ${id} not found`);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (found.companyId) orgPath.push({ level: 'company', id: found.companyId });
      this.access.assert(actorId, {
        permission: status === 'closed' ? 'quality.snag.close' : 'quality.snag.resolve',
        orgPath,
        resource: { type: 'project', id: found.projectId },
      });
    }

    const snag = status === 'closed' ? closeSnag(found, actorId) : resolveSnag(found, actorId);

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

  /**
   * Quality's answer to "may this project close?".
   *
   * Implements `QualityReadinessPort` for Projects. Quality stays the authority for what an open
   * NCR is; Projects only asks. Deliberately a COUNT and not a list — the closeout gate needs to
   * know whether anything blocks, and handing over records would invite the caller to re-decide
   * what counts as open, which is precisely the drift this port exists to prevent.
   *
   * `major` is this domain's highest NCR severity, so it is what "critical" means here. Reading it
   * from Quality rather than restating a threshold in Projects is the point of the port.
   */
  async readProjectQualityReadiness(
    tenantId: Id,
    projectId: Id,
  ): Promise<{ openNcrs: number; criticalOpenNcrs: number; openSnags: number }> {
    const [ncrs, snags] = await Promise.all([this.listNcrs(tenantId), this.listSnags(tenantId)]);
    const projectNcrs = ncrs.filter((n) => n.projectId === projectId && n.status !== 'closed');
    const projectSnags = snags.filter((sn) => sn.projectId === projectId && sn.status === 'open');
    return {
      openNcrs: projectNcrs.length,
      criticalOpenNcrs: projectNcrs.filter((n) => n.severity === 'major').length,
      openSnags: projectSnags.length,
    };
  }

  /**
   * Quality's own verdict on a project's health — §24.
   *
   * Distinct from the readiness reading above, and deliberately so. That one hands Projects COUNTS
   * and lets §27 decide what they mean for a closeout. This one hands Projects a JUDGEMENT, because
   * §24 is explicitly barred from deciding what Quality means by serious.
   *
   * The mapping is an extension of a threshold this domain has already declared rather than a new
   * one: §27 blocks a closeout on an open `major` NCR, so an open `major` is what Quality calls
   * critical, and the same fact reads the same way in both places. Quality changes this line when
   * Quality changes its mind; Projects never does.
   *
   * Note the vocabulary: `major` is this domain's highest NCR severity. The readiness field above
   * is named `criticalOpenNcrs`, which renames a Quality term on its way out — worth correcting at
   * that boundary one day, but not by propagating it into new code here.
   */
  async readProjectQualityHealth(tenantId: Id, projectId: Id): Promise<HealthSignal> {
    const base = `/project/${encodeURIComponent(projectId)}/workspace/quality`;
    const { openNcrs, criticalOpenNcrs: openMajorNcrs, openSnags } = await this.readProjectQualityReadiness(tenantId, projectId);

    if (openMajorNcrs > 0) {
      return {
        id: 'quality-ncr',
        domain: 'quality',
        state: 'CRITICAL',
        reason: `${openMajorNcrs} major non-conformance${openMajorNcrs === 1 ? '' : 's'} still open.`,
        href: base,
        measure: { value: openMajorNcrs },
      };
    }
    if (openNcrs > 0) {
      return {
        id: 'quality-ncr',
        domain: 'quality',
        state: 'AT_RISK',
        reason: `${openNcrs} non-conformance${openNcrs === 1 ? '' : 's'} still open.`,
        href: base,
        measure: { value: openNcrs },
      };
    }
    if (openSnags > 0) {
      return {
        id: 'quality-ncr',
        domain: 'quality',
        state: 'WATCH',
        reason: `${openSnags} snag${openSnags === 1 ? '' : 's'} outstanding.`,
        href: base,
        measure: { value: openSnags },
      };
    }
    return { id: 'quality-ncr', domain: 'quality', state: 'CLEAR' };
  }

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listSnags(tenantId: Id, projectId?: string): Promise<Snag[]> {
    const all = await this.snagStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
  }

  listSnagsPaged(tenantId: Id, page: PageParams): Promise<Page<Snag>> {
    return this.snagStore.listPaged(tenantId, page);
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
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.itp.create', orgPath, resource: { type: 'project', id: input.projectId } });
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

  /**
   * Put the inspection plan in force.
   *
   * TOOK NO ACTOR AND ASSERTED NOTHING. An ITP says what must be inspected, witnessed and held; its
   * only gate was the permission the guard DERIVED from the route path, reachable through
   * `quality.*`. So the plan was written, put in force and later declared complete by one role, and
   * none of the three acts left a name.
   */
  async activateItp(tenantId: Id, actorId: Id | null, id: Id): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    this.assertItpPerm(actorId, tenantId, itp.companyId, 'quality.itp.activate', itp.projectId);
    const updated = activateItp(itp, actorId);
    await this.tx.run(async (handle) => { await this.itpStore.save(updated, handle); });
    return updated;
  }

  private assertItpPerm(actorId: Id | null, tenantId: Id, companyId: string | null, permission: string, projectId: Id): void {
    if (!actorId) return;
    const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: tenantId }];
    if (companyId) orgPath.push({ level: 'company', id: companyId });
    this.access.assert(actorId, { permission, orgPath, resource: { type: 'project', id: projectId } });
  }

  async recordItpPoint(tenantId: Id, id: Id, pointIndex: number, result: PointResult): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    const updated = recordPointResult(itp, pointIndex, result);
    await this.tx.run(async (handle) => { await this.itpStore.save(updated, handle); });
    return updated;
  }

  /** Declare the inspections complete, and say who declared it. */
  async closeItp(tenantId: Id, actorId: Id | null, id: Id): Promise<Itp> {
    const itp = await this.itpStore.findById(id, tenantId);
    if (!itp) throw new Error(`ITP ${id} not found`);
    this.assertItpPerm(actorId, tenantId, itp.companyId, 'quality.itp.close', itp.projectId);
    const updated = closeItp(itp, actorId);
    const event = makeEvent({
      type: QUALITY_EVENT.itpClosed,
      tenantId, companyId: itp.companyId, actorId,
      aggregateType: 'quality.itp', aggregateId: id,
      payload: { reference: itp.reference },
    });
    await this.tx.run(async (handle) => {
      await this.itpStore.save(updated, handle);
      await this.events.appendWithClient(handle, [event]);
    });
    return updated;
  }

  /**
   * Implements `QualityEvidencePort` for Testing & Commissioning (TC-GATE-3).
   *
   * T&C cannot declare a system ready while Quality has an open non-conformance against it, and it
   * must show the ITP requirements a person has tied to that system. Both facts are Quality's, so
   * they are answered here rather than inferred over there.
   *
   * Read-only, and it hands back what Quality already holds — including each ITP point's RESULT,
   * which stays Quality's to set. T&C displays it and never writes it.
   */
  async readProjectQualityEvidence(tenantId: Id, projectId: Id) {
    const [ncrs, itps, snags, irs] = await Promise.all([
      this.listNcrs(tenantId), this.listItps(tenantId), this.listSnags(tenantId), this.listInspections(tenantId),
    ]);
    return {
      // Inspection requests (TC-GATE-13). They carry the canonical discipline since TC-GATE-12 —
      // before that, four values that could not name an ELV system, which is why T&C could not read
      // them. The lifecycle travels untouched: what "approved" means is Quality's to say.
      irs: irs
        .filter((ir) => ir.projectId === projectId)
        .map((ir) => ({
          id: ir.id,
          irNumber: ir.irNumber,
          discipline: ir.discipline as string,
          status: ir.status as string,
          locationDetail: ir.locationDetail,
        })),
      // Snags (TC-GATE-9). Quality's own severity scale and its own three-state lifecycle travel
      // untouched: a consumer that re-decided what "open" means would be the drift this port exists
      // to prevent. Handover was blind to these until now — it read T&C's punch items through the
      // commissioning chain and nothing else, while Projects' closeout has always counted snags, so
      // the two gates could disagree about one project.
      snags: snags
        .filter((s) => s.projectId === projectId)
        .map((s) => ({
          id: s.id,
          description: s.description,
          locationDetail: s.locationDetail,
          severity: s.severity as string,
          status: s.status as string,
          assignedTo: s.assignedTo,
        })),
      ncrs: ncrs
        .filter((n) => n.projectId === projectId)
        .map((n) => ({ id: n.id, ncrNumber: n.ncrNumber, system: n.system, severity: n.severity, status: n.status })),
      itps: itps
        .filter((i) => i.projectId === projectId)
        .map((i) => ({
          id: i.id,
          reference: i.reference,
          title: i.title,
          discipline: i.discipline,
          status: i.status,
          points: i.points.map((p) => ({
            activity: p.activity,
            pointType: p.pointType as string,
            acceptanceCriteria: p.acceptanceCriteria,
            result: p.result as string,
          })),
        })),
    };
  }

  listItps(tenantId: Id): Promise<Itp[]> {
    return this.itpStore.findAll(tenantId);
  }

  listItpsPaged(tenantId: Id, page: PageParams): Promise<Page<Itp>> {
    return this.itpStore.listPaged(tenantId, page);
  }

  // ── Material Approval Requests (MAR) ───────────────────────────────────────

  async createMaterialApproval(input: NewMaterialApproval): Promise<MaterialApproval> {
    await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      // `quality.material-approval.create`, not `quality.mar.create`. The route derives and declares
      // the first spelling; this asserted the second, so the two guarded the same act under
      // different names and NO role in the catalogue granted the abbreviation — it was reachable
      // only through the `quality.*` wildcard, which is why only QA/QC and admin could ever raise a
      // request. Exactly the defect ENG-03 found between the technical-query route and its service.
      this.access.assert(input.createdBy, { permission: 'quality.material-approval.create', orgPath, resource: { type: 'project', id: input.projectId } });
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
  /**
   * Procurement's owned rule: is there a standing REFUSAL against this supplier on this project?
   *
   * The rule is Procurement's, not Quality's, and it is pinned in Procurement's own suite — "blocks
   * PO issuance when the supplier has a rejected MAR", and, decisively, "ALLOWS PO issuance when the
   * supplier has no rejected MARs". That second one is the boundary: no refusal means allow.
   *
   * ENG-04 briefly widened this to refuse a PENDING request too. That was reverted. It read as a
   * stricter, therefore better, control — but nothing owned it: no frozen Procurement authority says
   * an undecided request stops a purchase, and a supplier-level PENDING for one material would have
   * blocked an order for a different one. A partial control that a later wave must replace is a
   * temporary authority, and renaming it would not have earned it a place.
   *
   * What the answer CANNOT say is whether the material on a given order is the approved one. That
   * needs a canonical purchased-material identity, which does not exist here; the frozen roadmap
   * gives it to Wave 4 (`BUY-01`). The read is therefore returned in full and honestly named so the
   * caller can see supplier-level evidence for what it is, while `passed` reflects only the one rule
   * Procurement actually owns.
   */
  async checkMaterialApprovalGate(
    tenantId: string,
    projectId: string,
    supplier: string | { id?: string | null; name?: string | null },
  ): Promise<{ passed: boolean; standing: SupplierMaterialStanding; reason: string; references: string[] }> {
    const asked = typeof supplier === 'string' ? { name: supplier } : supplier;
    if (!projectId || (!asked.id && !asked.name)) {
      return { passed: true, standing: 'UNKNOWN', reason: 'no project or supplier to check against', references: [] };
    }
    const mars = await this.marStore.findByProject(projectId, tenantId);
    const read = supplierMaterialStanding(mars, asked);
    return {
      // Exactly Procurement's rule: a standing refusal blocks, everything else allows.
      passed: !read.hasStandingRefusal,
      standing: read.standing,
      reason: read.reason,
      references: read.references,
    };
  }

  /**
   * Quality hard gate for Projects work-package/milestone completion.
   * A WBS node cannot be marked complete while the project has active ITPs
   * with unresolved (pending) inspection points.
   */
  async checkItpReleaseGate(
    tenantId: string,
    projectId: string,
  ): Promise<{ passed: boolean; openItps?: string[]; reason?: string }> {
    if (!projectId) return { passed: true };
    const itps = await this.itpStore.findByProject(projectId, tenantId);
    const open = itps.filter((i) => i.status === 'active' && !allPointsResolved(i));
    if (open.length > 0) {
      const refs = open.map((i) => i.reference);
      return {
        passed: false,
        openItps: refs,
        reason: `Project has ${open.length} active ITP(s) with pending inspection points: ${refs.join(', ')}`,
      };
    }
    return { passed: true };
  }

  // ── Equipment calibration ──────────────────────────────────────────────────

  async recordCalibration(input: NewCalibration): Promise<Calibration> {
    if (input.projectId) await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(input.createdBy, { permission: 'quality.calibration.create', orgPath, ...(input.projectId ? { resource: { type: 'project' as const, id: input.projectId } } : {}) });
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
    if (input.projectId) await this.projectScope?.requireProject(input.tenantId, input.projectId);
    if (actorId && this.access) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      this.access.assert(actorId, { permission: 'quality.calibration.create', orgPath, ...(input.projectId ? { resource: { type: 'project' as const, id: input.projectId } } : {}) });
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

  /** Optionally narrowed to one project — see the workspace project scope (server-side). */
  async listAudits(tenantId: string, projectId?: string): Promise<AuditSchedule[]> {
    const all = await this.auditStore.findAll(tenantId);
    return projectId ? all.filter((r) => r.projectId === projectId) : all;
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
