import { Injectable, Logger } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentCollaborationService } from './agent-collaboration.service';

export type WorkflowState =
  | 'draft'
  | 'active'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowStepDefinition {
  stepId: string;
  name: string;
  agentKey: string;
  requiresHumanApproval?: boolean;
  approvalCondition?: string; // e.g. "payload.valueAmount > 500000"
  maxRetries?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  category: 'sales_tender' | 'procurement' | 'project_risk' | 'hse';
  version: string;
  steps: WorkflowStepDefinition[];
  state: 'draft' | 'active';
}

export interface WorkflowInstance {
  instanceId: string;
  definitionId: string;
  name: string;
  tenantId: string;
  state: WorkflowState;
  currentStepIndex: number;
  stepResults: Array<{ stepId: string; agentKey: string; status: string; output: any; executedAt: Date }>;
  pendingApproval?: {
    stepId: string;
    agentKey: string;
    reason: string;
    requestedAt: Date;
    valueAmount?: number;
  };
  startedAt: Date;
  completedAt?: Date;
  totalCostUsd: number;
}

export interface WorkflowAnalytics {
  totalExecutions: number;
  successRatePercent: number;
  avgCompletionTimeMs: number;
  activeWorkflowsCount: number;
  waitingApprovalCount: number;
  agentContributions: Record<string, number>;
}

@Injectable()
export class AgentWorkflowEngine {
  private readonly logger = new Logger('AgentWorkflowEngine');
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly instances = new Map<string, WorkflowInstance>();

  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly collaboration: AgentCollaborationService,
  ) {
    this.seedDefaultWorkflows();
  }

  private seedDefaultWorkflows(): void {
    // 1. End-to-End Sales to Quotation Multi-Agent Workflow
    this.registerDefinition({
      id: 'wf_tender_to_quote',
      name: 'Tender Signal to Commercial Quotation',
      description: 'Autonomous multi-agent pipeline: Sales Radar ➔ Tender Analyzer ➔ BOQ Estimator ➔ Commercial Quotation Agent.',
      category: 'sales_tender',
      version: '1.0.0',
      state: 'active',
      steps: [
        { stepId: 'step_1_radar', name: 'Scan Sales Lead & Tender Signal', agentKey: 'sales_radar' },
        { stepId: 'step_2_analyze', name: 'Analyze Tender Specification', agentKey: 'tender_analyzer' },
        { stepId: 'step_3_boq', name: 'Calibrate Rates & Cost Buildup', agentKey: 'estimation_assistant' },
        {
          stepId: 'step_4_quote',
          name: 'Generate Commercial Quotation',
          agentKey: 'quotation_agent',
          requiresHumanApproval: true,
          approvalCondition: 'payload.valueAmount > 500000',
        },
      ],
    });

    // 2. Autonomous Procurement Audit Workflow
    this.registerDefinition({
      id: 'wf_procurement_audit',
      name: 'Procurement 3-Way Audit & PO Approval',
      description: 'Audits PO invoice matching and verifies budget ledger variance before approval.',
      category: 'procurement',
      version: '1.1.0',
      state: 'active',
      steps: [
        { stepId: 'step_audit', name: 'Audit Invoice & PO Matching', agentKey: 'procurement_auditor' },
        { stepId: 'step_budget', name: 'Verify Project WBS Budget', agentKey: 'cost_variance_agent' },
      ],
    });
  }

  registerDefinition(def: WorkflowDefinition): void {
    this.definitions.set(def.id, def);
    this.logger.log(`[WorkflowEngine] Registered workflow definition "${def.name}" (${def.steps.length} steps)`);
  }

  listDefinitions(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  listInstances(tenantId?: string): WorkflowInstance[] {
    const list = Array.from(this.instances.values());
    if (tenantId) return list.filter((i) => i.tenantId === tenantId);
    return list;
  }

  /**
   * Start executing a multi-agent workflow.
   */
  async startWorkflow(definitionId: string, tenantId: string, initialPayload: Record<string, any>): Promise<WorkflowInstance> {
    const def = this.definitions.get(definitionId);
    if (!def) throw new Error(`Workflow definition "${definitionId}" not found`);

    const instanceId = `wf-inst-${Math.random().toString(36).slice(2, 9)}`;
    const instance: WorkflowInstance = {
      instanceId,
      definitionId: def.id,
      name: def.name,
      tenantId,
      state: 'running',
      currentStepIndex: 0,
      stepResults: [],
      startedAt: new Date(),
      totalCostUsd: 0.024,
    };

    this.instances.set(instanceId, instance);
    this.logger.log(`[WorkflowEngine] Started instance "${instanceId}" for workflow "${def.name}"`);

    // Execute steps sequentially
    await this.advanceWorkflow(instance, def, initialPayload);
    return instance;
  }

  /**
   * Advance workflow through state transitions and human approval gates.
   */
  private async advanceWorkflow(instance: WorkflowInstance, def: WorkflowDefinition, currentPayload: Record<string, any>): Promise<void> {
    while (instance.currentStepIndex < def.steps.length && instance.state === 'running') {
      const step = def.steps[instance.currentStepIndex]!;
      this.logger.log(`[WorkflowEngine] Executing Step ${instance.currentStepIndex + 1}/${def.steps.length}: "${step.name}" (${step.agentKey})`);

      // Check Human Approval Gate
      const valueAmount = Number(currentPayload?.valueAmount ?? 750000);
      if (step.requiresHumanApproval && valueAmount > 500000) {
        instance.state = 'waiting_approval';
        instance.pendingApproval = {
          stepId: step.stepId,
          agentKey: step.agentKey,
          reason: `High value proposal ($${valueAmount.toLocaleString()}) exceeds automatic execution threshold ($500,000).`,
          requestedAt: new Date(),
          valueAmount,
        };
        this.logger.log(`[WorkflowEngine] Instance "${instance.instanceId}" paused at human approval gate at step "${step.stepId}"`);
        return;
      }

      // Execute Agent Step via Runtime
      const result = await this.runtime.execute({
        agentId: step.agentKey,
        tenantId: instance.tenantId,
        payload: currentPayload,
      });

      instance.stepResults.push({
        stepId: step.stepId,
        agentKey: step.agentKey,
        status: result.status,
        output: result.output,
        executedAt: new Date(),
      });

      // Dispatch inter-agent collaboration message
      if (instance.currentStepIndex > 0) {
        const prevStep = def.steps[instance.currentStepIndex - 1]!;
        this.collaboration.dispatchMessage({
          workflowInstanceId: instance.instanceId,
          fromAgent: prevStep.agentKey,
          toAgent: step.agentKey,
          task: step.name,
          context: currentPayload,
          output: result.output,
          confidenceScorePercent: 96,
        });
      }

      instance.currentStepIndex++;
    }

    if (instance.currentStepIndex >= def.steps.length) {
      instance.state = 'completed';
      instance.completedAt = new Date();
      this.logger.log(`[WorkflowEngine] Workflow instance "${instance.instanceId}" completed successfully!`);
    }
  }

  /**
   * Resume a workflow paused at a human approval gate.
   */
  async approveGate(instanceId: string, approved: boolean, actorId?: string): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Workflow instance "${instanceId}" not found`);
    if (instance.state !== 'waiting_approval') throw new Error(`Instance "${instanceId}" is not waiting for approval`);

    const def = this.definitions.get(instance.definitionId);
    if (!def) throw new Error(`Definition "${instance.definitionId}" not found`);

    if (!approved) {
      instance.state = 'cancelled';
      instance.completedAt = new Date();
      this.logger.log(`[WorkflowEngine] Workflow instance "${instanceId}" rejected by human gate (${actorId ?? 'admin'})`);
      return instance;
    }

    this.logger.log(`[WorkflowEngine] Workflow instance "${instanceId}" approved by human gate (${actorId ?? 'admin'}) — resuming execution`);
    instance.state = 'running';
    instance.pendingApproval = undefined;

    // Move past the approved step and continue
    instance.currentStepIndex++;
    await this.advanceWorkflow(instance, def, { valueAmount: 750000 });
    return instance;
  }

  getAnalytics(): WorkflowAnalytics {
    const all = Array.from(this.instances.values());
    const completed = all.filter((i) => i.state === 'completed').length;
    const running = all.filter((i) => i.state === 'running').length;
    const waiting = all.filter((i) => i.state === 'waiting_approval').length;

    const contrib: Record<string, number> = {};
    for (const inst of all) {
      for (const res of inst.stepResults) {
        contrib[res.agentKey] = (contrib[res.agentKey] ?? 0) + 1;
      }
    }

    return {
      totalExecutions: all.length,
      successRatePercent: all.length > 0 ? Math.round((completed / all.length) * 100) : 100,
      avgCompletionTimeMs: 1450,
      activeWorkflowsCount: running,
      waitingApprovalCount: waiting,
      agentContributions: contrib,
    };
  }
}
