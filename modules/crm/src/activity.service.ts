import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { CRM_ACTIVITY_EVENT, type Activity, type NewActivity, cancelActivity, completeActivity, makeActivity, reopenActivity } from './domain/activity';
import { CRM_ACTIVITY_STORE, type ActivityFilter, type ActivityStore } from './activity-store';

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
  ) {}

  async create(input: NewActivity): Promise<Activity> {
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

  async cancel(id: Id): Promise<Activity> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`activity ${id} not found`);
    const updated = cancelActivity(existing);
    await this.store.save(updated);
    this.logger.log(`Activity cancelled: ${updated.subject} (${id})`);
    return updated;
  }

  async reopen(id: Id): Promise<Activity> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`activity ${id} not found`);
    const updated = reopenActivity(existing);
    await this.store.save(updated);
    this.logger.log(`Activity reopened: ${updated.subject} (${id})`);
    return updated;
  }

  async complete(id: Id, at?: string): Promise<Activity> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`activity ${id} not found`);
    const updated = completeActivity(existing, at);
    await this.store.save(updated);
    await this.events.append([
      makeEvent({
        type: CRM_ACTIVITY_EVENT.completed,
        tenantId: updated.tenantId, companyId: updated.companyId, actorId: null,
        aggregateType: 'crm.activity', aggregateId: id,
        payload: { subject: updated.subject, completedAt: updated.completedAt },
      }),
    ]);
    return updated;
  }

  get(id: Id): Promise<Activity | null> {
    return this.store.get(id);
  }

  list(filter?: ActivityFilter): Promise<Activity[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ActivityFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
