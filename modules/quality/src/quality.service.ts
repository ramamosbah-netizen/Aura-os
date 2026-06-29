import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';

import { type Ncr, makeNcr } from './domain/ncr';
import { type InspectionRequest, makeInspectionRequest } from './domain/inspection-request';
import { type Snag, makeSnag } from './domain/snag';

export const NCR_STORE = Symbol('NCR_STORE');
export const INSPECTION_REQUEST_STORE = Symbol('INSPECTION_REQUEST_STORE');
export const SNAG_STORE = Symbol('SNAG_STORE');

import {
  type NcrStore,
  type InspectionRequestStore,
  type SnagStore,
} from './store.interface';

export const QUALITY_EVENT = {
  ncrRaised: 'quality.ncr.raised',
  irApproved: 'quality.ir.approved',
  snagClosed: 'quality.snag.closed',
};

@Injectable()
export class QualityService {
  private readonly logger = new Logger('QualityControl');

  constructor(
    @Inject(NCR_STORE) private readonly ncrStore: NcrStore,
    @Inject(INSPECTION_REQUEST_STORE) private readonly irStore: InspectionRequestStore,
    @Inject(SNAG_STORE) private readonly snagStore: SnagStore,
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
}
