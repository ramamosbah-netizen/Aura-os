import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  SCHEDULE_EVENT,
  type ProjectSchedule,
  type NewProjectSchedule,
  type NewScheduleTask,
  type ScheduleSummary,
  makeProjectSchedule,
  setScheduleTasks,
  setBaseline,
  summariseSchedule,
} from './domain/schedule';
import { SCHEDULE_STORE, type ScheduleStore } from './schedule-store';

/** Project schedule (Gantt) service — one per project; owns `aura_projects_schedules`. */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger('ProjectSchedule');

  constructor(
    @Inject(SCHEDULE_STORE) private readonly store: ScheduleStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Create-or-replace the project's schedule (idempotent per project; keeps baseline). */
  async save(input: NewProjectSchedule): Promise<ProjectSchedule> {
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    let sch: ProjectSchedule;
    if (existing) {
      sch = setScheduleTasks(existing, input.tasks ?? []);
      await this.store.update(sch);
    } else {
      sch = makeProjectSchedule(input);
      await this.store.create(sch);
    }
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.saved,
        tenantId: sch.tenantId, companyId: sch.companyId, actorId: sch.createdBy,
        aggregateType: 'projects.schedule', aggregateId: sch.id,
        payload: { projectId: sch.projectId, tasks: sch.tasks.length },
      }),
    ]);
    return sch;
  }

  async setBaseline(tenantId: Id, projectId: Id): Promise<ProjectSchedule> {
    const sch = await this.store.getByProject(tenantId, projectId);
    if (!sch) throw new Error(`no schedule for project ${projectId}`);
    if (sch.tasks.length === 0) throw new Error('cannot baseline an empty schedule');
    const updated = setBaseline(sch);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: SCHEDULE_EVENT.baselineSet,
        tenantId, companyId: sch.companyId, actorId: null,
        aggregateType: 'projects.schedule', aggregateId: sch.id,
        payload: { projectId, baselineSetAt: updated.baselineSetAt },
      }),
    ]);
    this.logger.log(`Baseline set for project ${projectId} (${updated.tasks.length} tasks)`);
    return updated;
  }

  async summary(tenantId: Id, projectId: Id): Promise<ScheduleSummary | null> {
    const sch = await this.store.getByProject(tenantId, projectId);
    return sch ? summariseSchedule(sch) : null;
  }

  list(tenantId: Id): Promise<ProjectSchedule[]> {
    return this.store.list(tenantId);
  }
}
