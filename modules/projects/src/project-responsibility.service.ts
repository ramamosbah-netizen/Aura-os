import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { AccessService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { assertSameTenant, type Id, makeEvent } from '@aura/shared';
import {
  acceptProjectResponsibility, completeProjectResponsibility, makeProjectResponsibility,
  nextResponsibilityTimestamp, startProjectResponsibility, type NewProjectResponsibility, type ProjectResponsibility,
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

  /**
   * Can this person be given work on this project at all?
   *
   * Public, and asked BEFORE anything is written by callers that raise a responsibility as part of
   * a larger act (a milestone naming its owner, PLN-04). Such a caller must be able to refuse its
   * whole operation rather than save a record naming a recipient who will never receive anything —
   * and it must decide that by THIS rule, not a second copy of it that can drift out of step.
   *
   * A composition with no AccessService cannot answer, and says yes: membership is not knowable
   * there, and refusing every assignment because the question cannot be asked would be a different
   * false confidence.
   */
  canReceive(projectId: Id, assigneeId: Id): boolean {
    if (!this.access) return true;
    return this.access.grantsOf(assigneeId).some((grant) =>
      grant.scope.kind === 'resource' && grant.scope.resourceType === 'project' && grant.scope.resourceId === projectId,
    );
  }

  async assign(input: NewProjectResponsibility): Promise<ProjectResponsibility> {
    await this.guard(input.projectId, input.tenantId, input.assignedBy, 'projects.responsibility.create');
    if (!this.canReceive(input.projectId, input.assigneeId)) {
      throw new BadRequestException('assignee must be a member of this project');
    }
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

  /** App-layer reactor hook: attach one canonical issued drawing to its nominated delivery receipt. */
  async linkEngineeringRelease(input: {
    id: Id; tenantId: Id; projectId: Id; drawingId: Id; drawingCode: string;
    revision: string; transmittalRef: string; actorId: Id | null;
  }): Promise<ProjectResponsibility> {
    const existing = assertSameTenant(await this.rows.get(input.id), input.tenantId, 'Responsibility', input.id);
    if (existing.projectId !== input.projectId) throw new BadRequestException('responsibility does not belong to the drawing project');
    if (existing.workstream !== 'engineering_release') throw new BadRequestException('responsibility is not an engineering release receipt');
    if (existing.status === 'completed') throw new BadRequestException('completed responsibility cannot receive a new engineering release');
    if (existing.sourceId && existing.sourceId !== input.drawingId) throw new BadRequestException('responsibility is already linked to another engineering release');
    if (!input.drawingCode.trim() || !input.revision.trim() || !input.transmittalRef.trim()) {
      throw new BadRequestException('engineering release lineage is incomplete');
    }
    if (existing.sourceId === input.drawingId) {
      if (existing.sourceReference !== input.drawingCode.trim()
        || existing.sourceRevision !== input.revision.trim()
        || existing.transmittalRef !== input.transmittalRef.trim()) {
        throw new BadRequestException('engineering release lineage conflicts with the existing receipt');
      }
      return existing;
    }
    const linked: ProjectResponsibility = {
      ...existing,
      sourceType: 'engineering.drawing',
      sourceId: input.drawingId,
      sourceReference: input.drawingCode.trim(),
      sourceRevision: input.revision.trim(),
      transmittalRef: input.transmittalRef.trim(),
      linkedAt: existing.linkedAt ?? new Date().toISOString(),
      updatedAt: nextResponsibilityTimestamp(existing.updatedAt),
    };
    if (!(await this.rows.update(linked, existing.updatedAt))) {
      const concurrent = assertSameTenant(await this.rows.get(input.id), input.tenantId, 'Responsibility', input.id);
      if (concurrent.sourceId === input.drawingId
        && concurrent.sourceReference === input.drawingCode.trim()
        && concurrent.sourceRevision === input.revision.trim()
        && concurrent.transmittalRef === input.transmittalRef.trim()) return concurrent;
      throw new ConflictException('responsibility changed while the engineering release was being linked');
    }
    await this.emit('projects.responsibility.source_linked', linked, input.actorId);
    return linked;
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
    if (!(await this.rows.update(next, existing.updatedAt))) {
      throw new ConflictException('responsibility changed while the transition was being recorded');
    }
    await this.emit(`projects.responsibility.${verb}`, next, actorId);
    return next;
  }

  private guard(projectId: Id, tenantId: Id, actorId: Id, permission: string): Promise<void> {
    return assertProjectWriteAllowed({ projects: this.projects, access: this.access }, { projectId, tenantId, actorId, permission });
  }

  private async emit(type: string, value: ProjectResponsibility, actorId: Id | null): Promise<void> {
    await this.events.append([makeEvent({
      type, tenantId: value.tenantId, companyId: null, actorId,
      aggregateType: 'projects.responsibility', aggregateId: value.id,
      payload: {
        projectId: value.projectId, workstream: value.workstream, assigneeId: value.assigneeId,
        status: value.status, dueDate: value.dueDate, sourceType: value.sourceType,
        sourceId: value.sourceId, sourceReference: value.sourceReference,
        sourceRevision: value.sourceRevision, transmittalRef: value.transmittalRef,
        linkedAt: value.linkedAt,
      },
    })]);
  }
}
