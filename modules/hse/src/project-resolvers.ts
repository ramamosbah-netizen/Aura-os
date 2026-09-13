import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry, TenantContext } from '@aura/core';
import { INCIDENT_STORE, PTW_STORE, CAPA_STORE, RISK_ASSESSMENT_STORE, TOOLBOX_STORE } from './hse.service';
import type { HseIncidentStore, PermitToWorkStore, CapaActionStore, RiskAssessmentStore, ToolboxTalkStore } from './store.interface';

/**
 * HSE tells the permission guard which project each of its records belongs to.
 *
 * Fourteen HSE routes address a record by its own id — `ptws/:id/approve`, `incidents/:id/close`
 * and the rest. See `core/src/identity/project-resolver.ts` for the reasoning.
 *
 * `SafetyTrainingRecord` is deliberately absent: it carries no project. It is a fact about a
 * PERSON's competence, not about a site, and inventing a project for it to be scoped by would
 * invent a relationship the data does not have.
 */
@Injectable()
export class HseProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    private readonly tenant: TenantContext,
    @Inject(INCIDENT_STORE) private readonly incidents: HseIncidentStore,
    @Inject(PTW_STORE) private readonly ptws: PermitToWorkStore,
    @Inject(CAPA_STORE) private readonly capas: CapaActionStore,
    @Inject(RISK_ASSESSMENT_STORE) private readonly risks: RiskAssessmentStore,
  ) {}

  private tenantId(): string | null {
    try { return this.tenant.get().tenantId ?? null; } catch { return null; }
  }

  onModuleInit(): void {
    const scoped = <T extends { projectId?: string | null }>(
      find: (id: string, tenantId: string) => Promise<T | null>,
    ) => async (id: string): Promise<string | null> => {
      const tenantId = this.tenantId();
      if (!tenantId) return null;
      return (await find(id, tenantId))?.projectId ?? null;
    };

    this.registry.register('hse', 'incident', scoped((id, t) => this.incidents.findById(id, t)));
    this.registry.register('hse', 'ptw', scoped((id, t) => this.ptws.findById(id, t)));
    this.registry.register('hse', 'capa', scoped((id, t) => this.capas.findById(id, t)));
    this.registry.register('hse', 'risk-assessment', scoped((id, t) => this.risks.findById(id, t)));
  }
}
