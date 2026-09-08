import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, sameTenantOrNull } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import {
  type NewProjectIssue, type ProjectIssue, type ProjectIssuePatch, type ProjectIssueStatus,
  type ProjectIssueSummary,
  makeProjectIssue, setProjectIssueStatus, summariseProjectIssues, updateProjectIssue,
} from './domain/project-issue';
import { PROJECT_ISSUE_STORE, type ProjectIssueFilter, type ProjectIssueStore } from './project-issue-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { assertProjectWriteAllowed } from './project-write-guard';

/**
 * §21 — the ISSUE register's authority, and nothing else.
 *
 * WHAT THIS SERVICE CANNOT DO, BY CONSTRUCTION. Its dependencies are the issue store, the event
 * store, the project store and the access service — nothing belonging to Quality, Engineering,
 * Procurement or HSE, and not the risk store either. So resolving an issue that references NCR-17
 * cannot close NCR-17: there is no path from here to that record, in either direction.
 *
 * That is `REFERENCE ≠ OWNERSHIP` enforced by the dependency graph rather than by a comment, and it
 * is what keeps §28 Single Source of Truth intact while still letting a project manager see the
 * whole picture in one place.
 */
@Injectable()
export class ProjectIssueService {
  private readonly logger = new Logger('ProjectIssueService');

  constructor(
    @Inject(PROJECT_ISSUE_STORE) private readonly issues: ProjectIssueStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  async raise(input: NewProjectIssue & { actorId?: Id | null }): Promise<ProjectIssue> {
    await this.guard(input.projectId, input.tenantId, input.actorId, 'projects.issue.create');
    // `originRiskId` is refused here on purpose: an issue that came from a risk is created only by
    // the materialisation command, in the same transaction that retires the risk. Accepting it on
    // this path would be a second writer for provenance, and could claim a risk had landed when it
    // is still sitting OPEN on the register.
    if (input.originRiskId) {
      throw new Error('an issue can only be linked to a risk by materialising that risk');
    }
    const issue = makeProjectIssue({
      ...input,
      raisedBy: input.raisedBy ?? input.actorId ?? null,
      createdBy: input.createdBy ?? input.actorId ?? null,
    });
    await this.issues.create(issue);
    this.logger.log(`Issue raised on ${issue.projectId}: ${issue.title} (${issue.severity})`);
    await this.emit('projects.issue.raised', issue.tenantId, issue.createdBy, issue.id, {
      projectId: issue.projectId, title: issue.title, area: issue.area, severity: issue.severity,
      originRiskId: null,
    });
    return issue;
  }

  async update(id: Id, patch: ProjectIssuePatch, actorId?: Id | null): Promise<ProjectIssue> {
    const existing = await this.mustGet(id);
    await this.guard(existing.projectId, existing.tenantId, actorId, 'projects.issue.update');
    const next = updateProjectIssue(existing, patch);
    await this.issues.update(next);
    return next;
  }

  /**
   * Move an issue's lifecycle.
   *
   * Ending it writes to the issue and to nothing else. An issue referencing NCR-17 that reaches
   * `resolved` leaves NCR-17 exactly as it was — this service has no way to reach it, which is the
   * point of the dependency list above. The event records how many records it pointed at, so an
   * auditor can see what was NOT closed alongside it.
   */
  async setStatus(
    id: Id,
    status: ProjectIssueStatus,
    input: { note?: string | null; actorId?: Id | null } = {},
  ): Promise<ProjectIssue> {
    const existing = await this.mustGet(id);
    await this.guard(existing.projectId, existing.tenantId, input.actorId, 'projects.issue.update');
    const next = setProjectIssueStatus(existing, status, input);
    await this.issues.update(next);
    await this.emit('projects.issue.status_changed', next.tenantId, input.actorId ?? null, next.id, {
      projectId: next.projectId, fromStatus: existing.status, toStatus: status,
      resolution: next.resolution, referencedRecords: next.references.length,
    });
    return next;
  }

  list(filter?: ProjectIssueFilter): Promise<ProjectIssue[]> {
    return this.issues.list(filter);
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<ProjectIssue | null> {
    return sameTenantOrNull(await this.issues.get(id), this.tenant?.boundTenantId());
  }

  /**
   * The issue a risk materialised into, if any.
   *
   * The read side of single-sourced provenance: with no `linkedIssueId` on the risk, this is how
   * "what did this risk become?" is answered.
   */
  async findByOriginRisk(riskId: Id): Promise<ProjectIssue | null> {
    return sameTenantOrNull(await this.issues.findByOriginRisk(riskId), this.tenant?.boundTenantId());
  }

  /** `today` is supplied by the caller so the rules stay clock-free. */
  async summaryFor(projectId: Id, today: string): Promise<ProjectIssueSummary> {
    return summariseProjectIssues(await this.issues.list({ projectId }), today);
  }

  private async mustGet(id: Id): Promise<ProjectIssue> {
    return assertSameTenant(await this.issues.get(id), this.tenant?.boundTenantId(), 'Issue', id);
  }

  private guard(projectId: Id, tenantId: Id, actorId: Id | null | undefined, permission: string): Promise<void> {
    return assertProjectWriteAllowed(
      { projects: this.projects, access: this.access },
      { projectId, tenantId, actorId, permission },
    );
  }

  private async emit(type: string, tenantId: Id, actorId: Id | null, aggregateId: Id, payload: Record<string, unknown>): Promise<void> {
    await this.events.append([
      makeEvent({ type, tenantId, companyId: null, actorId, aggregateType: 'projects.issue', aggregateId, payload }),
    ]);
  }
}
