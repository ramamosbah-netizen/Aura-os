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
 * Two aggregates, not more. Test items, runs, punch items, O&M items and spares are all reached
 * THROUGH their commissioning record or handover package — the route names the parent, and the
 * parent is what the guard resolves. Registering the children as well would answer a question no
 * route asks.
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
