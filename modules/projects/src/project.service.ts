import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Id, makeEvent, newId } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore } from '@aura/core';
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
