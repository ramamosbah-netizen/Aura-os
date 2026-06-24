import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { PROJECT_EVENT, type Project, type NewProject, makeProject } from './domain/project';
import { PROJECT_STORE, type ProjectFilter, type ProjectStore } from './project-store';

/**
 * Projects service — the final deal-chain module, cloned from the template. Owns
 * `aura_projects_projects`, goes through the kernel access seam, and emits
 * `projects.project.*` on the spine. A project delivers a signed contract, so it carries
 * the contract AND account references by id + snapshot — never a join.
 */
@Injectable()
export class ProjectService {
  private readonly logger = new Logger('Projects');

  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  async create(input: NewProject): Promise<Project> {
    if (input.createdBy) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'projects.project.create', orgPath };
      this.access.assert(input.createdBy, target);
    }

    const project = makeProject(input);
    await this.store.create(project);
    await this.events.append([
      makeEvent({
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
      }),
    ]);
    this.logger.log(`Project created: ${project.title} (${project.id}) value=${project.value}`);
    return project;
  }

  get(id: Id): Promise<Project | null> {
    return this.store.get(id);
  }

  list(filter?: ProjectFilter): Promise<Project[]> {
    return this.store.list(filter);
  }
}
