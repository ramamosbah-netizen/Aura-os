import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { PROJECT_EVENT, type Project, type NewProject, makeProject } from './domain/project';
import { PROJECT_STORE, type ProjectFilter, type ProjectStore } from './project-store';

const CREATE_PROJECT = 'projects.project.create';

/**
 * Projects service — the final deal-chain module. Owns `aura_projects_projects`, emits
 * `projects.project.*` on the spine. A project delivers a signed contract, so it carries
 * the contract AND account references by id + snapshot — never a join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency →
 * one transaction → atomic row + outbox event), mirroring the CRM reference integration.
 */
@Injectable()
export class ProjectService implements OnModuleInit {
  private readonly logger = new Logger('Projects');

  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly commands: CommandBus,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewProject, Project>({
      name: CREATE_PROJECT,
      permission: 'projects.project.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('project title is required');
      },
      handler: async (command, tx) => {
        const project = makeProject(command.payload);
        const event = makeEvent({
          type: PROJECT_EVENT.created,
          tenantId: project.tenantId,
          companyId: project.companyId,
          actorId: project.createdBy,
          aggregateType: 'projects.project',
          aggregateId: project.id,
          payload: {
            title: project.title,
            status: project.status,
            value: project.value,
            contract: project.contractId
              ? { id: project.contractId, title: project.contractTitle }
              : null,
            account: project.accountId
              ? { id: project.accountId, name: project.accountName }
              : null,
          },
        });
        await this.store.createWithClient(tx, project);
        await this.events.appendWithClient(tx, [event]);
        this.logger.log(`Project created: ${project.title} (${project.id}) value=${project.value}`);
        return project;
      },
    });
  }

  create(input: NewProject, idempotencyKey?: string | null): Promise<Project> {
    return this.commands.execute<Project>({
      id: newId(),
      name: CREATE_PROJECT,
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      actorId: input.createdBy ?? null,
      payload: input,
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  /** Update mutable fields on a project (title, reference, status, value). */
  async update(id: Id, patch: Partial<Pick<Project, 'title' | 'reference' | 'status' | 'value'>>): Promise<Project> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`project ${id} not found`);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: Project = { ...existing, ...defined };
    const event = makeEvent({
      type: PROJECT_EVENT.updated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'projects.project',
      aggregateId: updated.id,
      payload: { title: updated.title, status: updated.status, value: updated.value },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Project updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  get(id: Id): Promise<Project | null> {
    return this.store.get(id);
  }

  list(filter?: ProjectFilter): Promise<Project[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ProjectFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
