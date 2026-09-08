import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  type NewProjectRisk, type ProjectRisk, type ProjectRiskPatch, type ProjectRiskStatus,
  type ProjectRiskSummary,
  makeProjectRisk, setProjectRiskStatus, summariseProjectRisks, updateProjectRisk,
} from './domain/project-risk';
import { PROJECT_RISK_STORE, type ProjectRiskFilter, type ProjectRiskStore } from './project-risk-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { assertProjectWriteAllowed } from './project-write-guard';

/**
 * §21 — the RISK register's authority, and nothing else.
 *
 * It holds `PROJECT_RISK_STORE` and no issue store, so it cannot write an issue even by mistake.
 * That is the whole point of the split: one service owning both registers becomes a unified
 * register with two tables behind it, whatever the schema says.
 *
 * It also cannot mark a risk MATERIALISED. That state is produced only by
 * `ProjectRiskMaterialisationService`, inside one transaction with the issue it created — so a risk
 * can never read as having landed without the live problem existing.
 */
@Injectable()
export class ProjectRiskService {
  private readonly logger = new Logger('ProjectRiskService');

  constructor(
    @Inject(PROJECT_RISK_STORE) private readonly risks: ProjectRiskStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(TOKEN) explicitly, for the reason this module documents everywhere: a
    // union-typed ctor param emits `Object` for design:paramtypes, so Nest resolves nothing and
    // injects null in silence — which would make every guard below inert without failing anything.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  async raise(input: NewProjectRisk & { actorId?: Id | null }): Promise<ProjectRisk> {
    await this.guard(input.projectId, input.tenantId, input.actorId, 'projects.risk.create');
    const risk = makeProjectRisk({ ...input, createdBy: input.createdBy ?? input.actorId ?? null });
    await this.risks.create(risk);
    this.logger.log(`Risk raised on ${risk.projectId}: ${risk.title} (${risk.severity})`);
    await this.emit('projects.risk.raised', risk.tenantId, risk.createdBy, risk.id, {
      projectId: risk.projectId, title: risk.title, area: risk.area, severity: risk.severity,
    });
    return risk;
  }

  async update(id: Id, patch: ProjectRiskPatch, actorId?: Id | null): Promise<ProjectRisk> {
    const existing = await this.mustGet(id);
    await this.guard(existing.projectId, existing.tenantId, actorId, 'projects.risk.update');
    const next = updateProjectRisk(existing, patch);
    await this.risks.update(next);
    return next;
  }

  /**
   * Move a risk's lifecycle.
   *
   * `note` is what makes ACCEPTED mean something — the domain refuses an acceptance nobody had to
   * justify. The event carries the previous status because a register that records only where a
   * risk ended cannot answer how it got there.
   *
   * `MATERIALISED` is refused by the domain, whatever is passed here.
   */
  async setStatus(
    id: Id,
    status: ProjectRiskStatus,
    input: { note?: string | null; actorId?: Id | null } = {},
  ): Promise<ProjectRisk> {
    const existing = await this.mustGet(id);
    await this.guard(existing.projectId, existing.tenantId, input.actorId, 'projects.risk.update');
    const next = setProjectRiskStatus(existing, status, input.note);
    await this.risks.update(next);
    await this.emit('projects.risk.status_changed', next.tenantId, input.actorId ?? null, next.id, {
      projectId: next.projectId, fromStatus: existing.status, toStatus: status,
      note: input.note?.trim() ?? null,
    });
    return next;
  }

  list(filter?: ProjectRiskFilter): Promise<ProjectRisk[]> {
    return this.risks.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<ProjectRisk | null> {
    return sameTenantOrNull(await this.risks.get(id), this.tenant?.boundTenantId());
  }

  /** `today` is supplied by the caller so the rules stay clock-free. */
  async summaryFor(projectId: Id, today: string): Promise<ProjectRiskSummary> {
    return summariseProjectRisks(await this.risks.list({ projectId }), today);
  }

  private async mustGet(id: Id): Promise<ProjectRisk> {
    return assertSameTenant(await this.risks.get(id), this.tenant?.boundTenantId(), 'Risk', id);
  }

  private guard(projectId: Id, tenantId: Id, actorId: Id | null | undefined, permission: string): Promise<void> {
    return assertProjectWriteAllowed(
      { projects: this.projects, access: this.access },
      { projectId, tenantId, actorId, permission },
    );
  }

  private async emit(type: string, tenantId: Id, actorId: Id | null, aggregateId: Id, payload: Record<string, unknown>): Promise<void> {
    await this.events.append([
      makeEvent({ type, tenantId, companyId: null, actorId, aggregateType: 'projects.risk', aggregateId, payload }),
    ]);
  }
}
