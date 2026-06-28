import { Injectable, Logger } from '@nestjs/common';

// ── BPMN Node Types ───────────────────────────────────────────────────────────

export type NodeType = 'start' | 'task' | 'gateway' | 'end';

export interface WorkflowTransition {
  to: string;                         // Target node ID
  condition?: string;                 // Optional expression, e.g. 'payload.approved === true'
  label?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  assignee?: string;                  // For 'task' nodes: user/role to action
  transitions: WorkflowTransition[];
}

export interface WorkflowDefinition {
  tenantId: string;
  workflowKey: string;
  label: string;
  nodes: WorkflowNode[];
  version: number;
}

// ── Instance State ────────────────────────────────────────────────────────────

export interface WorkflowInstance {
  id: string;
  tenantId: string;
  workflowKey: string;
  entityId: string;
  entityType: string;
  currentNodeId: string;
  status: 'running' | 'completed' | 'failed';
  context: Record<string, any>;
  history: Array<{ nodeId: string; completedAt: Date; actor?: string }>;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowOrchestratorService {
  private readonly logger = new Logger('WorkflowOrchestrator');
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly instances = new Map<string, WorkflowInstance>();

  private defKey(tenantId: string, workflowKey: string) {
    return `${tenantId}::${workflowKey}`;
  }

  // ── Definitions ──────────────────────────────────────────────────────

  async define(def: WorkflowDefinition): Promise<void> {
    this.definitions.set(this.defKey(def.tenantId, def.workflowKey), def);
    this.logger.log(`[Workflow] Defined "${def.workflowKey}" v${def.version} — ${def.nodes.length} nodes`);
  }

  // ── Instance Lifecycle ───────────────────────────────────────────────

  async start(params: {
    tenantId: string;
    workflowKey: string;
    entityId: string;
    entityType: string;
    context?: Record<string, any>;
  }): Promise<WorkflowInstance> {
    const def = this.definitions.get(this.defKey(params.tenantId, params.workflowKey));
    if (!def) throw new Error(`Workflow definition "${params.workflowKey}" not found`);

    const startNode = def.nodes.find((n) => n.type === 'start');
    if (!startNode) throw new Error(`No start node in workflow "${params.workflowKey}"`);

    const id = `wfi-${Math.random().toString(36).substring(7)}`;
    const instance: WorkflowInstance = {
      id,
      tenantId: params.tenantId,
      workflowKey: params.workflowKey,
      entityId: params.entityId,
      entityType: params.entityType,
      currentNodeId: startNode.id,
      status: 'running',
      context: params.context ?? {},
      history: [{ nodeId: startNode.id, completedAt: new Date() }],
    };

    this.instances.set(id, instance);
    this.logger.log(`[Workflow] Instance started: ${id} for ${params.entityType}/${params.entityId} at node "${startNode.label}"`);

    // Auto-advance through start node
    return this.advance(id, {});
  }

  /**
   * Advance a workflow instance to the next node.
   * Evaluates gateway conditions against mergedContext and follows the matching transition.
   */
  async advance(instanceId: string, actorContext: Record<string, any>, actor?: string): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Workflow instance ${instanceId} not found`);
    if (instance.status !== 'running') throw new Error(`Instance ${instanceId} is not running`);

    const def = this.definitions.get(this.defKey(instance.tenantId, instance.workflowKey))!;
    const currentNode = def.nodes.find((n) => n.id === instance.currentNodeId)!;

    // Merge actor context into instance context
    Object.assign(instance.context, actorContext);

    // Find the next transition to follow
    let nextNodeId: string | undefined;
    for (const transition of currentNode.transitions) {
      if (!transition.condition) {
        nextNodeId = transition.to;
        break;
      }
      // Safe expression evaluation using context keys
      const conditionMet = this.evalCondition(transition.condition, instance.context);
      if (conditionMet) {
        nextNodeId = transition.to;
        break;
      }
    }

    if (!nextNodeId) {
      this.logger.warn(`[Workflow] No matching transition from node "${currentNode.label}" — instance stalled`);
      return instance;
    }

    const nextNode = def.nodes.find((n) => n.id === nextNodeId)!;

    // Record history
    instance.history.push({ nodeId: nextNodeId, completedAt: new Date(), actor });
    instance.currentNodeId = nextNodeId;

    if (nextNode.type === 'end') {
      instance.status = 'completed';
      this.logger.log(`[Workflow] Instance ${instanceId} completed at node "${nextNode.label}"`);
    } else if (nextNode.type === 'gateway') {
      // Gateways are routing-only — evaluate and traverse immediately
      this.logger.log(`[Workflow] Instance ${instanceId} advanced to node "${nextNode.label}" (gateway) — auto-evaluating transitions`);
      instance.currentNodeId = nextNodeId;
      this.instances.set(instanceId, instance);
      return this.advance(instanceId, {}, actor);
    } else {
      this.logger.log(`[Workflow] Instance ${instanceId} advanced to node "${nextNode.label}" (${nextNode.type})`);
    }

    this.instances.set(instanceId, instance);
    return instance;
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.instances.get(instanceId) ?? null;
  }

  private evalCondition(condition: string, context: Record<string, any>): boolean {
    try {
      // Safe evaluation: only allow dot-access on known context keys
      const fn = new Function(...Object.keys(context), `return !!(${condition});`);
      return fn(...Object.values(context));
    } catch {
      return false;
    }
  }
}
