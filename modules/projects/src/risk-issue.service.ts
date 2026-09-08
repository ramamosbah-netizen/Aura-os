import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  assertSameTenant, type AccessTarget, type Id, makeEvent, type OrgLevel, type RiskStatus,
  sameTenantOrNull,
} from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  type NewProjectRisk, type ProjectRisk, type ProjectRiskPatch, type ProjectRiskSummary,
  makeProjectRisk, setProjectRiskStatus, summariseProjectRisks, updateProjectRisk,
} from './domain/project-risk';
import {
  type NewProjectIssue, type ProjectIssue, type ProjectIssueLink, type ProjectIssuePatch,
  type ProjectIssueSeverity, type ProjectIssueStatus, type ProjectIssueSummary,
  makeProjectIssue, materialiseRiskAsIssue, setProjectIssueStatus, summariseProjectIssues,
  updateProjectIssue,
} from './domain/project-issue';
import {
  PROJECT_ISSUE_STORE, PROJECT_RISK_STORE,
  type ProjectIssueFilter, type ProjectIssueStore, type ProjectRiskFilter, type ProjectRiskStore,
} from './risk-issue-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';

/**
 * §21 — the two registers, governed.
 *
 * One service for both because materialisation writes to both and must not be split across two
 * callers. The registers themselves stay separate: separate domain rules, separate tables,
 * separate lifecycles.
 *
 * WHAT THIS SERVICE CANNOT DO, by construction. It holds the risk store, the issue store, the event
 * store, the project store and the access service — and nothing belonging to Quality, Engineering,
 * Procurement or HSE. So resolving an issue that references NCR-17 cannot close NCR-17: there is no
 * path from here to that record, in either direction. That is `REFERENCE ≠ OWNERSHIP` enforced by
 * the dependency graph rather than by a comment, and it is what keeps §28 intact while still
 * letting a project manager see the whole picture in one place.
 */
@Injectable()
export class RiskIssueService {
  private readonly logger = new Logger('RiskIssueService');

  constructor(
    @Inject(PROJECT_RISK_STORE) private readonly risks: ProjectRiskStore,
    @Inject(PROJECT_ISSUE_STORE) private readonly issues: ProjectIssueStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(TOKEN) explicitly, for the reason this module documents everywhere: a
    // union-typed ctor param emits `Object` for design:paramtypes, so Nest resolves nothing and
    // injects null in silence — which would make every guard below inert without failing anything.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  // ── RISKS ────────────────────────────────────────────────────────────────

  async raiseRisk(input: NewProjectRisk & { actorId?: Id | null }): Promise<ProjectRisk> {
    await this.assertProjectAccess(input.projectId, input.tenantId, input.actorId, 'projects.risk.create');
    const risk = makeProjectRisk({ ...input, createdBy: input.createdBy ?? input.actorId ?? null });
    await this.risks.create(risk);
    this.logger.log(`Risk raised on ${risk.projectId}: ${risk.title} (${risk.severity})`);
    await this.emit('projects.risk.raised', risk.tenantId, risk.createdBy, 'projects.risk', risk.id, {
      projectId: risk.projectId, title: risk.title, area: risk.area, severity: risk.severity,
    });
    return risk;
  }

  async updateRisk(id: Id, patch: ProjectRiskPatch, actorId?: Id | null): Promise<ProjectRisk> {
    const existing = await this.mustGetRisk(id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, actorId, 'projects.risk.update');
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
   */
  async setRiskStatus(id: Id, status: RiskStatus, input: { note?: string | null; actorId?: Id | null } = {}): Promise<ProjectRisk> {
    const existing = await this.mustGetRisk(id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, input.actorId, 'projects.risk.update');
    const next = setProjectRiskStatus(existing, status, input.note);
    await this.risks.update(next);
    await this.emit('projects.risk.status_changed', next.tenantId, input.actorId ?? null, 'projects.risk', next.id, {
      projectId: next.projectId, fromStatus: existing.status, toStatus: status, note: input.note?.trim() ?? null,
    });
    return next;
  }

  async listRisks(filter?: ProjectRiskFilter): Promise<ProjectRisk[]> {
    return this.risks.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async getRisk(id: Id): Promise<ProjectRisk | null> {
    return sameTenantOrNull(await this.risks.get(id), this.tenant?.boundTenantId());
  }

  // ── ISSUES ───────────────────────────────────────────────────────────────

  async raiseIssue(input: NewProjectIssue & { actorId?: Id | null }): Promise<ProjectIssue> {
    await this.assertProjectAccess(input.projectId, input.tenantId, input.actorId, 'projects.issue.create');
    const issue = makeProjectIssue({
      ...input,
      raisedBy: input.raisedBy ?? input.actorId ?? null,
      createdBy: input.createdBy ?? input.actorId ?? null,
    });
    await this.issues.create(issue);
    this.logger.log(`Issue raised on ${issue.projectId}: ${issue.title} (${issue.severity})`);
    await this.emit('projects.issue.raised', issue.tenantId, issue.createdBy, 'projects.issue', issue.id, {
      projectId: issue.projectId, title: issue.title, area: issue.area, severity: issue.severity,
      originRiskId: issue.originRiskId,
    });
    return issue;
  }

  async updateIssue(id: Id, patch: ProjectIssuePatch, actorId?: Id | null): Promise<ProjectIssue> {
    const existing = await this.mustGetIssue(id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, actorId, 'projects.issue.update');
    const next = updateProjectIssue(existing, patch);
    await this.issues.update(next);
    return next;
  }

  /**
   * Move an issue's lifecycle.
   *
   * Ending it writes to the issue and to nothing else. An issue linked to NCR-17 that reaches
   * `resolved` leaves NCR-17 exactly as it was — this service has no way to reach it, which is the
   * point of the dependency list above.
   */
  async setIssueStatus(
    id: Id,
    status: ProjectIssueStatus,
    input: { note?: string | null; actorId?: Id | null } = {},
  ): Promise<ProjectIssue> {
    const existing = await this.mustGetIssue(id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, input.actorId, 'projects.issue.update');
    const next = setProjectIssueStatus(existing, status, input);
    await this.issues.update(next);
    await this.emit('projects.issue.status_changed', next.tenantId, input.actorId ?? null, 'projects.issue', next.id, {
      projectId: next.projectId, fromStatus: existing.status, toStatus: status,
      resolution: next.resolution, linkedRecords: next.links.length,
    });
    return next;
  }

  async listIssues(filter?: ProjectIssueFilter): Promise<ProjectIssue[]> {
    return this.issues.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async getIssue(id: Id): Promise<ProjectIssue | null> {
    return sameTenantOrNull(await this.issues.get(id), this.tenant?.boundTenantId());
  }

  // ── MATERIALISATION ──────────────────────────────────────────────────────

  /**
   * A risk occurred. Record the live problem without destroying the forecast.
   *
   * The issue is written FIRST. The risk's `linked_issue_id` is a foreign key into the issues
   * table, so the other order would fail at the database — and on the no-database path it would
   * leave a risk pointing at an issue that does not exist. Writing the issue first means the worst
   * failure is an issue that names its origin risk while the risk does not yet name it back:
   * visible, and recoverable by re-running.
   */
  async materialiseRisk(
    id: Id,
    input: {
      title?: string;
      description?: string | null;
      severity?: ProjectIssueSeverity;
      owner?: string | null;
      dueDate?: string | null;
      raisedAt?: string | null;
      links?: ProjectIssueLink[];
      actorId?: Id | null;
    } = {},
  ): Promise<{ risk: ProjectRisk; issue: ProjectIssue }> {
    const existing = await this.mustGetRisk(id);
    await this.assertProjectAccess(existing.projectId, existing.tenantId, input.actorId, 'projects.issue.create');

    const { risk, issue } = materialiseRiskAsIssue(existing, input);
    await this.issues.create(issue);
    await this.risks.update(risk);

    this.logger.log(`Risk ${risk.id} materialised into issue ${issue.id} on ${risk.projectId}`);
    await this.emit('projects.risk.materialised', risk.tenantId, input.actorId ?? null, 'projects.risk', risk.id, {
      projectId: risk.projectId, issueId: issue.id, riskSeverity: risk.severity, issueSeverity: issue.severity,
    });
    await this.emit('projects.issue.raised', issue.tenantId, input.actorId ?? null, 'projects.issue', issue.id, {
      projectId: issue.projectId, title: issue.title, area: issue.area, severity: issue.severity,
      originRiskId: risk.id,
    });
    return { risk, issue };
  }

  // ── REGISTER SUMMARY ─────────────────────────────────────────────────────

  /**
   * Both registers for one project, rolled up.
   *
   * `today` is supplied by the caller so the rules stay clock-free and the same date decides
   * "overdue" on both sides of one screen.
   */
  async registerFor(projectId: Id, today: string): Promise<{
    risks: ProjectRisk[];
    issues: ProjectIssue[];
    riskSummary: ProjectRiskSummary;
    issueSummary: ProjectIssueSummary;
  }> {
    const [risks, issues] = await Promise.all([
      this.risks.list({ projectId }),
      this.issues.list({ projectId }),
    ]);
    return {
      risks,
      issues,
      riskSummary: summariseProjectRisks(risks, today),
      issueSummary: summariseProjectIssues(issues, today),
    };
  }

  // ── GUARDS ───────────────────────────────────────────────────────────────

  private async mustGetRisk(id: Id): Promise<ProjectRisk> {
    return assertSameTenant(await this.risks.get(id), this.tenant?.boundTenantId(), 'Risk', id);
  }

  private async mustGetIssue(id: Id): Promise<ProjectIssue> {
    return assertSameTenant(await this.issues.get(id), this.tenant?.boundTenantId(), 'Issue', id);
  }

  private async assertProjectAccess(projectId: Id, tenantId: Id, actorId: Id | null | undefined, permission: string): Promise<void> {
    if (this.projects) {
      const project = await this.projects.get(projectId);
      if (!project || project.tenantId !== tenantId) throw new Error(`project ${projectId} not found`);
    }
    if (actorId && this.access) {
      const target: AccessTarget = { permission, orgPath: [{ level: 'tenant' as OrgLevel, id: tenantId }] };
      this.access.assert(actorId, target);
    }
  }

  private async emit(
    type: string, tenantId: Id, actorId: Id | null, aggregateType: string, aggregateId: Id,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.append([
      makeEvent({ type, tenantId, companyId: null, actorId, aggregateType, aggregateId, payload }),
    ]);
  }
}
