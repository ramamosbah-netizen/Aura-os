import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, type PageParams, sameTenantOrNull } from '@aura/shared';
import { EVENT_STORE, type EventStore, TenantContext, UsersService } from '@aura/core';
import { ACTIVITY_RELATED_TYPES, CRM_ACTIVITY_EVENT, type Activity, type ActivityDetailsPatch, type NewActivity, archiveActivity, cancelActivity, completeActivity, editActivity, makeActivity, reopenActivity, startActivity } from './domain/activity';
import { CRM_ACTIVITY_STORE, type ActivityFilter, type ActivityStore, type ActivitySummary } from './activity-store';

/**
 * CRM Activity service — logged interactions + tasks across the deal chain. Owns
 * `aura_crm_activities` and emits `crm.activity.*` on the spine.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger('CRM');

  constructor(
    @Inject(CRM_ACTIVITY_STORE) private readonly store: ActivityStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(UsersService) private readonly users: UsersService | null = null,
  ) {}

  async create(input: NewActivity): Promise<Activity> {
    if ((input.relatedType == null) !== (input.relatedId == null)) {
      throw new BadRequestException('relatedType and relatedId must be supplied together');
    }
    if (input.relatedType && !(ACTIVITY_RELATED_TYPES as readonly string[]).includes(input.relatedType)) {
      throw new BadRequestException('invalid relatedType');
    }
    await this.assertAssignee(input.tenantId, input.assigneeId);
    const activity = makeActivity(input);
    await this.store.save(activity);
    await this.events.append([
      makeEvent({
        type: CRM_ACTIVITY_EVENT.created,
        tenantId: activity.tenantId,
        companyId: activity.companyId,
        actorId: activity.createdBy,
        aggregateType: 'crm.activity',
        aggregateId: activity.id,
        payload: { type: activity.type, subject: activity.subject, relatedType: activity.relatedType, relatedId: activity.relatedId },
      }),
    ]);
    this.logger.log(`Activity created: ${activity.type} "${activity.subject}" (${activity.id})`);
    return activity;
  }

  async updateDetails(id: Id, patch: ActivityDetailsPatch, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanEdit(existing, actorId);
    const updated = editActivity(existing, patch);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CRM_ACTIVITY_EVENT.updated,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: actorId ?? null,
        aggregateType: 'crm.activity',
        aggregateId: updated.id,
        payload: { subject: updated.subject, dueDate: updated.dueDate },
      }),
    ]);
    return updated;
  }

  async archive(id: Id, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanEdit(existing, actorId);
    const updated = archiveActivity(existing);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CRM_ACTIVITY_EVENT.archived,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: actorId ?? null,
        aggregateType: 'crm.activity',
        aggregateId: updated.id,
        payload: { subject: updated.subject },
      }),
    ]);
    return updated;
  }

  async cancel(id: Id, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanChangeLifecycle(existing, actorId);
    const updated = cancelActivity(existing);
    await this.store.save(updated);
    await this.appendLifecycleEvent(updated, existing.status, CRM_ACTIVITY_EVENT.cancelled, actorId);
    this.logger.log(`Activity cancelled: ${updated.subject} (${id})`);
    return updated;
  }

  /** G11 — begin work: open → in_progress, stamping startedAt. */
  async start(id: Id, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanChangeLifecycle(existing, actorId);
    const updated = startActivity(existing);
    await this.store.save(updated);
    await this.appendLifecycleEvent(updated, existing.status, CRM_ACTIVITY_EVENT.started, actorId);
    this.logger.log(`Activity started: ${updated.subject} (${id})`);
    return updated;
  }

  async reopen(id: Id, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanChangeLifecycle(existing, actorId);
    const updated = reopenActivity(existing);
    await this.store.save(updated);
    await this.appendLifecycleEvent(updated, existing.status, CRM_ACTIVITY_EVENT.reopened, actorId);
    this.logger.log(`Activity reopened: ${updated.subject} (${id})`);
    return updated;
  }

  async complete(id: Id, at?: string, outcome?: string | null, actorId?: Id | null): Promise<Activity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'activity', id);
    this.assertCanChangeLifecycle(existing, actorId);
    const updated = completeActivity(existing, at, outcome);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CRM_ACTIVITY_EVENT.completed,
        tenantId: updated.tenantId, companyId: updated.companyId, actorId: actorId ?? null,
        aggregateType: 'crm.activity', aggregateId: id,
        payload: { subject: updated.subject, previousStatus: existing.status, status: updated.status, completedAt: updated.completedAt },
      }),
    ]);
    return updated;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Activity | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: ActivityFilter): Promise<Activity[]> {
    return this.store.list(this.scopedFilter(filter));
  }

  listPaged(filter: ActivityFilter, page: PageParams) {
    return this.store.listPaged(this.scopedFilter(filter), page);
  }

  summary(filter?: ActivityFilter, now?: Date): Promise<ActivitySummary> {
    return this.store.summary(this.scopedFilter(filter), now);
  }

  listAll(filter?: ActivityFilter): Promise<Activity[]> {
    return this.store.listAll(this.scopedFilter(filter));
  }

  private scopedFilter(filter?: ActivityFilter): ActivityFilter {
    const boundTenant = this.tenant?.boundTenantId();
    if (!boundTenant) return filter ?? {};
    // A bound request cannot widen its scope by supplying another tenant id.
    return { ...(filter ?? {}), tenantId: boundTenant };
  }

  /** Personal work is owner-controlled even when the caller has tenant membership. */
  private assertCanChangeLifecycle(activity: Activity, actorId?: Id | null): void {
    if (!actorId || !this.isPersonalWork(activity)) return;
    if (activity.assigneeId !== actorId) {
      throw new ForbiddenException('Only the assigned user can change this personal activity.');
    }
  }

  private assertCanEdit(activity: Activity, actorId?: Id | null): void {
    if (!actorId || !this.isPersonalWork(activity)) return;
    if (activity.createdBy !== actorId && activity.assigneeId !== actorId) {
      throw new ForbiddenException('Only the creator or assigned user can edit this personal activity.');
    }
  }

  private isPersonalWork(activity: Activity): boolean {
    return activity.type === 'task' || activity.type === 'follow_up' || activity.type === 'reminder';
  }

  private async appendLifecycleEvent(activity: Activity, previousStatus: Activity['status'], eventType: string, actorId?: Id | null): Promise<void> {
    await this.events.append([makeEvent({
      type: eventType,
      tenantId: activity.tenantId,
      companyId: activity.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.activity',
      aggregateId: activity.id,
      payload: { subject: activity.subject, previousStatus, status: activity.status, startedAt: activity.startedAt, completedAt: activity.completedAt },
    })]);
  }

  /**
   * Assignment is a workspace relationship, not an arbitrary string. Resolve it through the
   * canonical tenant-scoped directory before persisting so unknown, foreign-tenant, and disabled
   * users cannot enter the personal-work queue. The optional dependency keeps in-memory module
   * tests and non-authenticated tooling compatible; production CoreModule always supplies it.
   */
  private async assertAssignee(tenantId: string, assigneeId?: Id | null): Promise<void> {
    if (assigneeId == null || !this.users) return;
    if (!assigneeId.trim()) throw new BadRequestException('assignee must be an active user in this workspace');
    await this.users.ensureTenant(tenantId);
    const assignee = this.users.get(tenantId, assigneeId);
    if (!assignee) throw new BadRequestException('assignee must be an active user in this workspace');
    if (!assignee.active) throw new BadRequestException('assignee is inactive in this workspace');
  }
}
