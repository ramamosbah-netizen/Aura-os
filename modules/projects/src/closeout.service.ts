import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import {
  CLOSEOUT_EVENT,
  type ProjectCloseout,
  type NewProjectCloseout,
  makeProjectCloseout,
  setCloseoutItem,
  finalizeCloseout,
} from './domain/closeout';
import { CLOSEOUT_STORE, type CloseoutFilter, type CloseoutStore } from './closeout-store';

/**
 * Project Closeout service — the end-of-lifecycle handover workflow. Owns
 * `aura_projects_closeouts`, one per project, and emits `projects.closeout.*` on the spine.
 */
@Injectable()
export class CloseoutService {
  private readonly logger = new Logger('Closeout');

  constructor(
    @Inject(CLOSEOUT_STORE) private readonly store: CloseoutStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async start(input: NewProjectCloseout): Promise<ProjectCloseout> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'projects.closeout.create', orgPath };
      this.access.assert(input.createdBy, target);
    }
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    if (existing) throw new Error(`project ${input.projectId} already has a closeout`);

    const c = makeProjectCloseout(input);
    await this.store.create(c);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.started,
        tenantId: c.tenantId, companyId: c.companyId, actorId: c.createdBy,
        aggregateType: 'projects.closeout', aggregateId: c.id,
        payload: { projectId: c.projectId, items: c.items.length },
      }),
    ]);
    this.logger.log(`Closeout started for project ${c.projectId} (${c.items.length} items)`);
    return c;
  }

  async setItem(tenantId: Id, id: Id, index: number, done: boolean): Promise<ProjectCloseout> {
    const c = await this.store.get(id);
    if (!c || c.tenantId !== tenantId) throw new Error(`closeout ${id} not found`);
    const updated = setCloseoutItem(c, index, done);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.itemUpdated,
        tenantId, companyId: c.companyId, actorId: null,
        aggregateType: 'projects.closeout', aggregateId: id,
        payload: { projectId: c.projectId, index, done },
      }),
    ]);
    return updated;
  }

  async finalize(tenantId: Id, id: Id, handoverDate: string, dlpMonths?: number): Promise<ProjectCloseout> {
    const c = await this.store.get(id);
    if (!c || c.tenantId !== tenantId) throw new Error(`closeout ${id} not found`);
    const updated = finalizeCloseout(c, handoverDate, dlpMonths);
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: CLOSEOUT_EVENT.completed,
        tenantId, companyId: c.companyId, actorId: null,
        aggregateType: 'projects.closeout', aggregateId: id,
        payload: { projectId: c.projectId, handoverDate: updated.handoverDate, dlpEndDate: updated.dlpEndDate },
      }),
    ]);
    this.logger.log(`Closeout completed for project ${c.projectId} — handover ${updated.handoverDate}, DLP ends ${updated.dlpEndDate}`);
    return updated;
  }

  get(id: Id): Promise<ProjectCloseout | null> {
    return this.store.get(id);
  }

  list(filter?: CloseoutFilter): Promise<ProjectCloseout[]> {
    return this.store.list(filter);
  }

  listPaged(filter: CloseoutFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
