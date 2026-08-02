import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Page, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { COMMISSIONING_STORE, type CommissioningStore } from './store.interface';
import {
  type CommissioningRecord,
  type ElvSystem,
  makeCommissioningRecord,
  recordTest,
  commission,
  fail,
} from './domain/commissioning-record';

/**
 * Commissioning (Test & Commission) application service. The register that proves ELV
 * systems perform to spec and captures the witnessed sign-off that unlocks handover.
 * Pure domain transitions live in domain/commissioning-record; this layer loads, applies,
 * and persists. Store is swapped Postgres/in-memory at the module DI seam.
 */
@Injectable()
export class CommissioningService {
  private readonly logger = new Logger('CommissioningService');

  constructor(
    @Inject(COMMISSIONING_STORE) private readonly store: CommissioningStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async register(params: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    code: string;
    title: string;
    system?: ElvSystem;
    location?: string | null;
    pointsTotal?: number;
    createdBy?: string | null;
  }): Promise<CommissioningRecord> {
    const rec = makeCommissioningRecord(params);
    await this.store.save(rec);
    this.logger.log(`[Commissioning] registered ${rec.code} (${rec.system}) on project ${rec.projectId}`);
    return rec;
  }

  async get(id: string, tenantId: string): Promise<CommissioningRecord | null> {
    return this.store.find(id, tenantId);
  }

  async list(tenantId: string, projectId?: string): Promise<CommissioningRecord[]> {
    return this.store.list(tenantId, projectId);
  }

  async listPaged(tenantId: string, page: PageParams, projectId?: string): Promise<Page<CommissioningRecord>> {
    return this.store.listPaged(tenantId, page, projectId);
  }

  async recordTest(
    id: string,
    tenantId: string,
    patch: { pointsPassed: number; pointsTotal?: number; testDate?: string | null; remarks?: string | null },
  ): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const next = recordTest(rec, patch);
    await this.store.save(next);
    return next;
  }

  async commission(
    id: string,
    tenantId: string,
    patch: { commissionedBy: string; witnessedBy: string },
  ): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const next = commission(rec, patch);
    await this.store.save(next);
    // A commissioned system is a step toward project handover; a reactor watches for the last one
    // on a project and opens the handover package (commission → handover).
    await this.events.append([
      makeEvent({
        type: 'commissioning.record.commissioned',
        tenantId: next.tenantId,
        companyId: next.companyId,
        actorId: next.createdBy,
        aggregateType: 'commissioning.record',
        aggregateId: next.id,
        payload: { projectId: next.projectId, projectName: next.projectName, system: next.system },
      }),
    ]);
    this.logger.log(`[Commissioning] ${rec.code} commissioned by ${patch.commissionedBy}, witnessed by ${patch.witnessedBy}`);
    return next;
  }

  async fail(id: string, tenantId: string, reason: string): Promise<CommissioningRecord> {
    const rec = await this.mustFind(id, tenantId);
    const next = fail(rec, reason);
    await this.store.save(next);
    return next;
  }

  private async mustFind(id: string, tenantId: string): Promise<CommissioningRecord> {
    const rec = await this.store.find(id, tenantId);
    if (!rec) throw new Error(`not found: commissioning record ${id}`);
    return rec;
  }
}
