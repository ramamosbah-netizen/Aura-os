import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry, TenantContext } from '@aura/core';
import { COMMISSIONING_STORE, type CommissioningStore } from './store.interface';

/**
 * Testing & Commissioning and Handover tell the permission guard which project each record belongs
 * to.
 *
 * Thirty-six routes here address a record by its own id — the largest entity-addressed surface in
 * the platform, and the one where it matters most: `records/:id/commission`, `records/:id/fail`,
 * `handovers/:id/submit`, `handovers/:id/accept`. These are the commands that close a project out.
 * See `core/src/identity/project-resolver.ts` for why the project is resolved from the record.
 *
 * Test points, runs and punch routes name the commissioning record. O&M, spares and training
 * also have child-addressed routes under /handovers; their subject resolvers below follow their
 * actual ownership instead of treating a child's id as a handover package id.
 */
@Injectable()
export class CommissioningProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    private readonly tenant: TenantContext,
    @Inject(COMMISSIONING_STORE) private readonly store: CommissioningStore,
  ) {}

  private tenantId(): string | null {
    try { return this.tenant.get().tenantId ?? null; } catch { return null; }
  }

  onModuleInit(): void {
    // These child records live under /handovers, but are owned by a commissioning SYSTEM,
    // not by the handover package whose id the generic controller resolver would try to load.
    // On create the parent is named; on mutation it comes from the persisted child.
    for (const [prefix, find] of [
      ['om-items', (id: string, tenant: string) => this.store.findOmItem(id, tenant)],
      ['spares', (id: string, tenant: string) => this.store.findSpareItem(id, tenant)],
    ] as const) {
      this.registry.registerSubject('commissioning/handovers', prefix, async (req) => {
        const tenantId = this.tenantId();
        if (!tenantId) return null;
        const childId = req.params?.id;
        const parentId = typeof childId === 'string'
          ? (await find(childId, tenantId))?.commissioningId
          : req.body?.commissioningId;
        if (typeof parentId !== 'string') return null;
        return (await this.store.find(parentId, tenantId))?.projectId ?? null;
      });
    }
    // Client training may cover a whole project, so it does not require a system relation.
    this.registry.registerSubject('commissioning/handovers', 'training', async (req) => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      if (typeof req.params?.id === 'string') {
        return (await this.store.findTrainingSession(req.params.id, tenantId))?.projectId ?? null;
      }
      if (typeof req.body?.commissioningId === 'string') {
        return (await this.store.find(req.body.commissioningId, tenantId))?.projectId ?? null;
      }
      return typeof req.body?.projectId === 'string' ? req.body.projectId : null;
    });
    this.registry.register('commissioning', 'record', async (id) => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      return (await this.store.find(id, tenantId))?.projectId ?? null;
    });
    this.registry.register('commissioning', 'handover', async (id) => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      return (await this.store.findHandover(id, tenantId))?.projectId ?? null;
    });
  }
}
