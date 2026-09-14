import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { assertSameTenant, type Id, makeEvent } from '@aura/shared';
import {
  acceptProjectResponsibility, completeProjectResponsibility, makeProjectResponsibility,
  startProjectResponsibility, type NewProjectResponsibility, type ProjectResponsibility,
} from './domain/project-responsibility';
import { PROJECT_RESPONSIBILITY_STORE, type ProjectResponsibilityFilter, type ProjectResponsibilityStore } from './project-responsibility-store';
import { PROJECT_STORE, type ProjectStore } from './project-store';
import { assertProjectWriteAllowed } from './project-write-guard';

@Injectable()
export class ProjectResponsibilityService {
  constructor(
    @Inject(PROJECT_RESPONSIBILITY_STORE) private readonly rows: ProjectResponsibilityStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(PROJECT_STORE) private readonly projects: ProjectStore | null = null,
    @Optional() @Inject(AccessService) private readonly access: AccessService | null = null,
  ) {}

  async assign(input: NewProjectResponsibility): Promise<ProjectResponsibility> {
    await this.guard(input.projectId, input.tenantId, input.assignedBy, 'projects.responsibility.create');
    const isMember = this.access?.grantsOf(input.assigneeId).some((grant) =>
      grant.scope.kind === 'resource' && grant.scope.resourceType === 'project' && grant.scope.resourceId === input.projectId,
    );
    if (this.access && !isMember) throw new BadRequestException('assignee must be a member of this project');
    const value = makeProjectResponsibility(input);
    await this.rows.create(value);
    await this.emit('projects.responsibility.assigned', value, input.assignedBy);
    return value;
  }

  list(filter: ProjectResponsibilityFilter): Promise<ProjectResponsibility[]> { return this.rows.list(filter); }

  async get(id: Id): Promise<ProjectResponsibility | null> {
    const value = await this.rows.get(id);
    return value && (!this.tenant?.boundTenantId() || value.tenantId === this.tenant.boundTenantId()) ? value : null;
  }

  accept(id: Id, projectId: Id, actorId: Id): Promise<ProjectResponsibility> {
    return this.move(id, projectId, actorId, acceptProjectResponsibility, 'accepted');
  }
  start(id: Id, projectId: Id, actorId: Id): Promise<ProjectResponsibility> {
    return this.move(id, projectId, actorId, startProjectResponsibility, 'started');
  }
  complete(id: Id, projectId: Id, actorId: Id): Promise<ProjectResponsibility> {
    return this.move(id, projectId, actorId, completeProjectResponsibility, 'completed');
  }

  private async move(
    id: Id, projectId: Id, actorId: Id,
    transition: (value: ProjectResponsibility) => ProjectResponsibility,
    verb: string,
  ): Promise<ProjectResponsibility> {
    const existing = assertSameTenant(await this.rows.get(id), this.tenant?.boundTenantId(), 'Responsibility', id);
    if (existing.projectId !== projectId) throw new BadRequestException('responsibility does not belong to the requested project');
    if (existing.assigneeId !== actorId) throw new ForbiddenException('only the assigned user may progress this responsibility');
    await this.guard(existing.projectId, existing.tenantId, actorId, 'projects.responsibility.update');
    let next: ProjectResponsibility;
    try { next = transition(existing); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    await this.rows.update(next);
    await this.emit(`projects.responsibility.${verb}`, next, actorId);
    return next;
  }

  private guard(projectId: Id, tenantId: Id, actorId: Id, permission: string): Promise<void> {
    return assertProjectWriteAllowed({ projects: this.projects, access: this.access }, { projectId, tenantId, actorId, permission });
  }

  private async emit(type: string, value: ProjectResponsibility, actorId: Id): Promise<void> {
    await this.events.append([makeEvent({
      type, tenantId: value.tenantId, companyId: null, actorId,
      aggregateType: 'projects.responsibility', aggregateId: value.id,
      payload: { projectId: value.projectId, workstream: value.workstream, assigneeId: value.assigneeId, status: value.status, dueDate: value.dueDate },
    })]);
  }
}
