import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { makeEvent } from '@aura/shared';
import { COMMISSIONING_STORE, type CommissioningStore } from './store.interface';
import {
  type HandoverPackage,
  type HandoverChecklist,
  makeHandoverPackage,
  updateChecklist,
  submit,
  accept,
  reject,
} from './domain/handover';

/**
 * A handover package enriched with the live commissioning status of its project — the
 * lifecycle link (stage 11 → 12): you should not hand a project over until its systems are
 * commissioned, so the package always shows how many of the project's systems are done.
 */
export type HandoverView = HandoverPackage & {
  systemsTotal: number;
  systemsCommissioned: number;
};

@Injectable()
export class HandoverService {
  private readonly logger = new Logger('HandoverService');

  constructor(
    @Inject(COMMISSIONING_STORE) private readonly store: CommissioningStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  private async withStats(pkg: HandoverPackage): Promise<HandoverView> {
    const systems = await this.store.list(pkg.tenantId, pkg.projectId);
    return {
      ...pkg,
      systemsTotal: systems.length,
      systemsCommissioned: systems.filter((s) => s.status === 'commissioned').length,
    };
  }

  async create(params: {
    tenantId: string;
    companyId?: string | null;
    projectId: string;
    projectName?: string | null;
    code: string;
    title: string;
    createdBy?: string | null;
  }): Promise<HandoverView> {
    const pkg = makeHandoverPackage(params);
    await this.store.saveHandover(pkg);
    this.logger.log(`[Handover] created ${pkg.code} for project ${pkg.projectId}`);
    return this.withStats(pkg);
  }

  async get(id: string, tenantId: string): Promise<HandoverView | null> {
    const pkg = await this.store.findHandover(id, tenantId);
    return pkg ? this.withStats(pkg) : null;
  }

  async list(tenantId: string, projectId?: string): Promise<HandoverView[]> {
    const pkgs = await this.store.listHandovers(tenantId, projectId);
    return Promise.all(pkgs.map((p) => this.withStats(p)));
  }

  async updateChecklist(id: string, tenantId: string, patch: Partial<HandoverChecklist>): Promise<HandoverView> {
    const next = updateChecklist(await this.mustFind(id, tenantId), patch);
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  async submit(id: string, tenantId: string): Promise<HandoverView> {
    const next = submit(await this.mustFind(id, tenantId));
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  async accept(
    id: string,
    tenantId: string,
    patch: { clientRepresentative: string; warrantyStartDate?: string; warrantyMonths?: number },
  ): Promise<HandoverView> {
    const next = accept(await this.mustFind(id, tenantId), patch);
    await this.store.saveHandover(next);
    // Client acceptance closes delivery and starts the warranty/DLP clock — the trigger for AMC.
    // A reactor turns this into a service contract (deliver → maintain).
    await this.events.append([
      makeEvent({
        type: 'commissioning.handover.accepted',
        tenantId: next.tenantId,
        companyId: next.companyId,
        actorId: next.createdBy,
        aggregateType: 'commissioning.handover',
        aggregateId: next.id,
        payload: {
          projectId: next.projectId,
          projectName: next.projectName,
          clientRepresentative: next.clientRepresentative,
          warrantyStartDate: next.warrantyStartDate,
          warrantyMonths: next.warrantyMonths,
        },
      }),
    ]);
    this.logger.log(`[Handover] ${next.code} accepted by ${patch.clientRepresentative} — warranty starts ${next.warrantyStartDate}`);
    return this.withStats(next);
  }

  async reject(id: string, tenantId: string, reason: string): Promise<HandoverView> {
    const next = reject(await this.mustFind(id, tenantId), reason);
    await this.store.saveHandover(next);
    return this.withStats(next);
  }

  private async mustFind(id: string, tenantId: string): Promise<HandoverPackage> {
    const pkg = await this.store.findHandover(id, tenantId);
    if (!pkg) throw new Error(`not found: handover package ${id}`);
    return pkg;
  }
}
