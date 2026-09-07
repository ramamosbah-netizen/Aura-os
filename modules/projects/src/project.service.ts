import { Inject, Injectable, Logger, type OnModuleInit, Optional } from '@nestjs/common';
import { assertSameTenant, type Id, makeEvent, newId, sameTenantOrNull } from '@aura/shared';
import { CommandBus, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner } from '@aura/core';
import { CREATABLE_STATES, PROJECT_EVENT, type Project, type NewProject, makeProject } from './domain/project';
import { isFrozenDeliverySource, verifyHandoverSnapshotHash } from './domain/handover';
import { PROJECT_STORE, type ProjectFilter, type ProjectStore } from './project-store';
import { WBS_STORE, type WbsStore } from './wbs-store';
import {
  evaluateTransition, availableTransitions, toLifecycleState,
  type LifecycleFacts, type TransitionGate,
} from './domain/project-lifecycle';

const CREATE_PROJECT = 'projects.project.create';

/**
 * Projects service — the final deal-chain module. Owns `aura_projects_projects`, emits
 * `projects.project.*` on the spine. A project delivers a signed contract, so it carries
 * the contract AND account references by id + snapshot — never a join.
 *
 * Create dispatches through the kernel `CommandBus` (validate → authz → idempotency →
 * one transaction → atomic row + outbox event), mirroring the CRM reference integration.
 */
/**
 * What the lifecycle gates need to read, and cannot compute here.
 *
 * Declared by this module and bound at the composition root, exactly as the closeout ports are.
 * Both are OPTIONAL, and an absent port yields facts the gates treat as UNMET rather than as
 * satisfied — a gate that passes because nobody answered is not a gate.
 */
export interface CommissioningLifecyclePort {
  readProjectCommissioningReadiness(tenantId: string, projectId: string): Promise<{ systems: number; commissioned: number }>;
}
export interface CloseoutLifecyclePort {
  assess(tenantId: string, projectId: string): Promise<{ ready: boolean }>;
}
export const COMMISSIONING_LIFECYCLE = Symbol('COMMISSIONING_LIFECYCLE');
export const CLOSEOUT_LIFECYCLE = Symbol('CLOSEOUT_LIFECYCLE');

/**
 * Abandoning a project, as a command rather than a field change.
 *
 * Both fields are required and neither has a default. A cancellation with no actor is a row that
 * changed by itself, and a cancellation with no reason is the same row with a label on it — this
 * shape is what stops `cancelled` degrading into `update({ status: 'cancelled' })`.
 */
export interface CancelProject {
  projectId: Id;
  actorId: Id;
  reason: string;
}

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
    // The lifecycle gates' fact sources. Each token is NAMED for the reason the comment above
    // gives — without it Nest resolves nothing and injects null, and the gates read "no scope, no
    // systems, closeout unknown" on a system that has all three.
    @Optional() @Inject(WBS_STORE) private readonly wbsRead: WbsStore | null = null,
    @Optional() @Inject(COMMISSIONING_LIFECYCLE) private readonly commissioningLifecycle: CommissioningLifecyclePort | null = null,
    @Optional() @Inject(CLOSEOUT_LIFECYCLE) private readonly closeoutLifecycle: CloseoutLifecyclePort | null = null,
  ) {}

  onModuleInit(): void {
    this.commands.register<NewProject, Project>({
      name: CREATE_PROJECT,
      permission: 'projects.project.create',
      validate: (input) => {
        if (!input.title || !input.title.trim()) throw new Error('project title is required');
        // Creation is a writer of `status` like any other, and until this line it was the
        // UNGOVERNED one: `POST /projects { status: 'active' }` put a project into execution
        // without a scope structure, a costed package or a baseline — the exact three things the
        // transition into `active` refuses. A gate that only applies to projects which admit their
        // age is not a gate.
        if (input.status && !CREATABLE_STATES.includes(input.status)) {
          throw new Error(
            `a project cannot be created in ${input.status}: reaching that state is a governed transition`,
          );
        }
        const origin = input.origin ?? (input.handoverLockedAt ? 'commercial_handover' : 'internal');
        if (origin === 'commercial_handover' && (!input.contractId || !input.handoverLockedAt || !input.handoverSnapshotHash || !input.handoverSnapshot || !isFrozenDeliverySource(input.handoverSnapshot) || !verifyHandoverSnapshotHash(input.handoverSnapshot, input.handoverSnapshotHash))) {
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
  /**
   * Read the facts the lifecycle gates are answerable to.
   *
   * A port that is absent or throws yields the UNMET value, never the satisfied one: no baseline,
   * no systems, closeout not established. The refusal that follows is the safe direction — the
   * opposite would let a missing wire authorise a start or a completion nobody checked.
   */
  private async lifecycleFacts(project: Project): Promise<LifecycleFacts> {
    const wbs = await this.wbsForGate(project);
    let commissioningSystems = 0;
    let commissioningDone = 0;
    if (this.commissioningLifecycle) {
      try {
        const read = await this.commissioningLifecycle.readProjectCommissioningReadiness(project.tenantId, project.id);
        commissioningSystems = read.systems;
        commissioningDone = read.commissioned;
      } catch (error) {
        this.logger.warn(`commissioning unreadable for lifecycle gate on ${project.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    let closeoutReady: boolean | null = null;
    if (this.closeoutLifecycle) {
      try {
        closeoutReady = (await this.closeoutLifecycle.assess(project.tenantId, project.id)).ready;
      } catch (error) {
        this.logger.warn(`closeout unreadable for lifecycle gate on ${project.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return {
      wbsNodes: wbs.nodes,
      wbsCosted: wbs.costed,
      // An approved baseline is evidenced by the snapshot the project itself carries — approver and
      // time included, per the CHECK constraint on the table.
      baselineApproved: Boolean(project.wbsBaselineSnapshot?.baselineId),
      commissioningSystems,
      commissioningDone,
      closeoutReady,
    };
  }

  private async wbsForGate(project: Project): Promise<{ nodes: number; costed: number }> {
    if (!this.wbsRead) return { nodes: 0, costed: 0 };
    try {
      const nodes = await this.wbsRead.list({ tenantId: project.tenantId, projectId: project.id });
      return { nodes: nodes.length, costed: nodes.filter((n) => n.plannedValue > 0).length };
    } catch {
      return { nodes: 0, costed: 0 };
    }
  }

  /** Every move available from here, with its verdict — for a UI that must not offer a dead button. */
  async transitionsFor(id: Id): Promise<TransitionGate[]> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'project', id);
    return availableTransitions(toLifecycleState(existing.status), await this.lifecycleFacts(existing));
  }

  /**
   * Abandon a project, on the record.
   *
   * Cancellation is the one transition no facts can block — a project may have to stop for reasons
   * no checklist models, and a gate on abandonment would trap it. But "always allowed" is not
   * "unaudited", and that distinction is the whole of this method: it is not reachable through
   * `changeStatus`, it demands an actor and a non-empty reason, and it emits an event of its own
   * carrying who, why, and what the project was doing when it stopped.
   *
   * Without those, `cancelled` would be an `update({ status: 'cancelled' })` — a row that changed
   * with nobody attached to it, which is exactly the shape of the thing an audit cannot follow.
   */
  async cancel(command: CancelProject): Promise<Project> {
    const reason = command.reason?.trim();
    if (!command.actorId) throw new Error('cancelling a project requires the actor doing it');
    // A blank reason is refused rather than stored: an empty string in the audit trail is worse
    // than no field, because it looks like an answer.
    if (!reason) throw new Error('cancelling a project requires a reason');

    const existing = assertSameTenant(await this.store.get(command.projectId), this.tenant?.boundTenantId(), 'project', command.projectId);
    const from = toLifecycleState(existing.status);
    // Structure still applies: a completed or already-cancelled project has nothing to abandon.
    const verdict = evaluateTransition(from, 'cancelled', await this.lifecycleFacts(existing));
    if (!verdict.allowed) {
      throw new Error(`cannot cancel project ${command.projectId}: ${verdict.gaps.join('; ')}`);
    }

    const updated: Project = { ...existing, status: 'cancelled' };
    const event = makeEvent({
      type: PROJECT_EVENT.cancelled,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: command.actorId,
      aggregateType: 'projects.project',
      aggregateId: updated.id,
      payload: {
        title: updated.title,
        reference: updated.reference,
        contractId: updated.contractId,
        value: updated.value,
        // What it was doing when it stopped. `status` alone would lose that: everything cancelled
        // reads `cancelled`, and the interesting question is always what it was before.
        fromStatus: existing.status,
        status: 'cancelled',
        reason,
        cancelledBy: command.actorId,
        cancelledAt: new Date().toISOString(),
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Project ${updated.title}: ${existing.status} → cancelled by ${command.actorId} (${reason})`);
    return updated;
  }

  async changeStatus(id: Id, status: Project['status']): Promise<Project> {
    // Cancellation carries evidence the other transitions do not, so it does not travel this road.
    // Leaving it reachable here would make the governed path optional, and an optional audit trail
    // is the one nobody fills in.
    if (status === 'cancelled') {
      throw new Error('cancelling a project requires an actor and a reason; use the cancel command');
    }
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'project', id);
    // Structure AND business conditions, in one place. The previous map only knew the shape, so a
    // project entered execution with no scope, no costed package and no baseline.
    const verdict = evaluateTransition(toLifecycleState(existing.status), toLifecycleState(status), await this.lifecycleFacts(existing));
    if (!verdict.allowed) {
      throw new Error(`cannot move project from ${existing.status} to ${status}: ${verdict.gaps.join('; ')}`);
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
