import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ProjectResolverRegistry, TenantContext } from '@aura/core';
import {
  DAILY_REPORT_STORE, DELAY_LOG_STORE, SITE_INSTRUCTION_STORE
} from './site.service';
import type {
  DailyReportStore, DelayLogStore, SiteInstructionStore
} from './store.interface';

/**
 * Site tells the permission guard which project each of its records belongs to.
 *
 * Thirteen site routes address a record by its own id — `daily-reports/:id/approve` and the whole
 * line-item family beneath it. See `core/src/identity/project-resolver.ts` for the reasoning.
 *
 * `SiteSurvey` is absent: it carries no project.
 */
@Injectable()
export class SiteProjectResolvers implements OnModuleInit {
  constructor(
    private readonly registry: ProjectResolverRegistry,
    private readonly tenant: TenantContext,
    @Inject(DAILY_REPORT_STORE) private readonly reports: DailyReportStore,
    @Inject(DELAY_LOG_STORE) private readonly delays: DelayLogStore,
    @Inject(SITE_INSTRUCTION_STORE) private readonly instructions: SiteInstructionStore,
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

    this.registry.register('site', 'daily-report', scoped((id, t) => this.reports.findById(id, t)));
    this.registry.register('site', 'delay-log', scoped((id, t) => this.delays.findById(id, t)));
    this.registry.register('site', 'instruction', scoped((id, t) => this.instructions.findById(id, t)));
  }
}
