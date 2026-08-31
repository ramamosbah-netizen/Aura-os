import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner } from '@aura/core';
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
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewProject, Project>({
      name: CREATE_PROJECT,
      permission: 'projects.project.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('project title is required');
        if (input.origin === 'commercial_handover' && (!input.contractId || !input.handoverLockedAt || !input.handoverSnapshotHash || !input.handoverSnapshot)) {
          throw new Error('commercial handover projects require a signed contract and immutable handover evidence');
        }
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

  /** Update descriptive/value fields on a project. Lifecycle status changes use changeStatus(). */
  /**
   * Guarded execution lifecycle: planned → active (STARTED) → completed
   * (COMPLETED — the reactor completes the source contract, closing the deal
   * chain), cancel from planned/active. Emits the specific spine events.
   */
  async changeStatus(id: Id, status: Project['status']): Promise<Project> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'project', id);
    const allowed: Record<string, string[]> = {
      active: ['planned'],
      completed: ['active'],
      cancelled: ['planned', 'active'],
      planned: [],
    };
    if (!allowed[status] || !allowed[status].includes(existing.status)) {
      throw new Error(`cannot move project from ${existing.status} to ${status}`);
    }
    const updated: Project = { ...existing, status };
    const eventType =
      status === 'active' ? PROJECT_EVENT.started : status === 'completed' ? PROJECT_EVENT.completed : PROJECT_EVENT.updated;
    await this.store.update(updated);
    await this.events.append([
      makeEvent({
        type: eventType,
        tenantId: updated.tenantId,
        companyId: updated.companyId,
        actorId: null,
        aggregateType: 'projects.project',
        aggregateId: updated.id,
        payload: { title: updated.title, status: updated.status, contractId: updated.contractId, value: updated.value },
      }),
    ]);
    this.logger.log(`Project ${updated.title}: ${existing.status} → ${status}`);
    return updated;
  }

  async update(id: Id, patch: Partial<Pick<Project, 'title' | 'reference' | 'status' | 'value'>>): Promise<Project> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'project', id);
    if (patch.status !== undefined) {
      throw new Error('project status changes must use the governed status command');
    }
    if (existing.handoverLockedAt && patch.value !== undefined && patch.value !== existing.value) {
      throw new Error(`project ${id} original contract value is immutable after handover; use an approved variation`);
    }
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

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Project | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: ProjectFilter): Promise<Project[]> {
    return this.store.list(filter);
  }

  listPaged(filter: ProjectFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
