import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AccessTarget,
  type DomainEvent,
  type Id,
  type NewWorkflowInstance,
  type OrgLevel,
  type WorkflowDefinition,
  type WorkflowInstance,
  WORKFLOW_EVENT,
  applyTransition,
  checkTransition,
  makeEvent,
  makeWorkflowInstance,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '../events/event-store';
import { AccessService } from '../identity/access.service';
import { WORKFLOW_STORE, type WorkflowInstanceFilter, type WorkflowStore } from './workflow-store';

export interface TransitionOptions {
  note?: string;
  /** Monetary amount for ABAC approval-limit guards on the transition. */
  amount?: number;
}

/**
 * Kernel workflow engine. Any module registers a WorkflowDefinition and drives
 * instances through it. This ties three kernel pieces together: it enforces a
 * transition's required permission via the AccessService (RBAC + ABAC approval
 * limits) and emits `workflow.*` events on the spine for every state change.
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger('Workflow');

  constructor(
    @Inject(WORKFLOW_STORE) private readonly store: WorkflowStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    private readonly access: AccessService,
  ) {}

  registerDefinition(def: WorkflowDefinition): Promise<void> {
    return this.store.saveDefinition(def);
  }

  getDefinition(key: string, tenantId?: Id | null): Promise<WorkflowDefinition | null> {
    return this.store.getDefinition(key, tenantId);
  }

  /** All definitions visible to a tenant — the admin registry (Vol 15 §2.3). */
  listDefinitions(tenantId?: Id | null): Promise<WorkflowDefinition[]> {
    return this.store.listDefinitions(tenantId);
  }

  async start(definitionKey: string, input: NewWorkflowInstance): Promise<WorkflowInstance> {
    const def = await this.store.getDefinition(definitionKey, input.tenantId);
    if (!def) throw new Error(`workflow definition not found: ${definitionKey}`);
    const instance = makeWorkflowInstance(def, input);
    await this.store.createInstance(instance);
    await this.events.append([
      makeEvent({
        type: WORKFLOW_EVENT.started,
        tenantId: instance.tenantId,
        companyId: instance.companyId,
        actorId: instance.createdBy,
        aggregateType: 'workflow.instance',
        aggregateId: instance.id,
        payload: {
          definitionKey,
          state: instance.currentState,
          linkedTo: { aggregateType: instance.aggregateType, aggregateId: instance.aggregateId },
        },
      }),
    ]);
    this.logger.log(
      `Started ${definitionKey} (${instance.id}) at "${instance.currentState}" → ${instance.aggregateType}:${instance.aggregateId}`,
    );
    return instance;
  }

  async transition(instanceId: Id, action: string, actorId: Id | null, opts: TransitionOptions = {}): Promise<WorkflowInstance> {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`workflow instance not found: ${instanceId}`);
    const def = await this.store.getDefinition(instance.definitionKey, instance.tenantId);
    if (!def) throw new Error(`workflow definition not found: ${instance.definitionKey}`);

    const check = checkTransition(def, instance, action);
    if (!check.ok || !check.transition) throw new Error(`invalid transition: ${check.reason}`);

    // Guard: enforce the transition's required permission via the access platform
    // (RBAC scope + optional ABAC approval limit). Ties workflow → access together.
    if (check.transition.permission) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: instance.tenantId }];
      if (instance.companyId) orgPath.push({ level: 'company', id: instance.companyId });
      const target: AccessTarget = {
        permission: check.transition.permission,
        orgPath,
        resource: { type: instance.aggregateType, id: instance.aggregateId },
        amount: opts.amount,
      };
      this.access.assert(actorId ?? '', target);
    }

    const next = applyTransition(def, instance, check.transition, actorId, opts.note);
    await this.store.updateInstance(next);

    const emitted: DomainEvent[] = [
      makeEvent({
        type: WORKFLOW_EVENT.transitioned,
        tenantId: next.tenantId,
        companyId: next.companyId,
        actorId,
        aggregateType: 'workflow.instance',
        aggregateId: next.id,
        payload: {
          definitionKey: next.definitionKey,
          action,
          from: instance.currentState,
          to: next.currentState,
          linkedTo: { aggregateType: next.aggregateType, aggregateId: next.aggregateId },
        },
      }),
    ];
    if (next.status === 'completed') {
      emitted.push(
        makeEvent({
          type: WORKFLOW_EVENT.completed,
          tenantId: next.tenantId,
          companyId: next.companyId,
          actorId,
          aggregateType: 'workflow.instance',
          aggregateId: next.id,
          payload: { definitionKey: next.definitionKey, finalState: next.currentState },
        }),
      );
    }
    await this.events.append(emitted);
    this.logger.log(
      `${next.definitionKey} (${next.id}) ${instance.currentState} --${action}--> ${next.currentState}${next.status === 'completed' ? ' [completed]' : ''}`,
    );
    return next;
  }

  getInstance(id: Id): Promise<WorkflowInstance | null> {
    return this.store.getInstance(id);
  }

  listInstances(filter?: WorkflowInstanceFilter): Promise<WorkflowInstance[]> {
    return this.store.listInstances(filter);
  }
}
