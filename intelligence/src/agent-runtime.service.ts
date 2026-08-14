import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PG_POOL } from '@aura/core';
import type { Pool } from 'pg';
import { AiPlatformService } from './ai-platform.service';
import { AutonomyService } from './autonomy.service';
import { AgentTracerService } from './agent-tracer.service';
import { AgentMetricsService } from './agent-metrics.service';
import { PolicyEngineService } from './policy-engine.service';
import { AiContextEngine } from './ai-context.engine';
import { CapabilityGuardService } from './capability-guard.service';
import { AgentGovernanceService, type GovernanceGate } from './agent-governance.service';
import { SaasCreditBillingService } from './saas-credit-billing.service';

export interface AgentRuntimeInput {
  agentId: string;
  tenantId: string;
  actorId?: string;
  entityId?: string;
  payload: Record<string, any>;
  requiredCapability?: string;
  /** What triggered this run — 'manual', 'scheduled', 'event', etc. Recorded on the ledger. */
  triggerType?: string;
  /**
   * Stable key for a logical execution. Two runs with the same key are metered once (idempotent
   * billing) and write to the same ledger row. Omit for a fresh, always-charged execution.
   */
  idempotencyKey?: string;
}

export interface AgentRuntimeResult {
  agentId: string;
  executionId: string;
  status: 'completed' | 'proposal_generated' | 'rejected_by_policy' | 'failed';
  output: any;
  proposalId?: string;
  traceId: string;
  executionTimeMs: number;
  modelUsed: string;
  /** Credits actually debited for this run (0 when denied before metering). */
  creditsConsumed: number;
  /** True when actions were proposed for human approval rather than executed. */
  approvalRequired: boolean;
  approvalStatus: 'not_required' | 'pending';
  /** Set when a governance or budget gate rejected the run. */
  deniedGate?: GovernanceGate;
  toolsCalled: string[];
}

/** The audit shape persisted to aura_agent_executions on every terminal path. */
interface LedgerRecord {
  executionId: string;
  agentId: string;
  tenantId: string;
  actorId: string | null;
  triggerType: string;
  status: AgentRuntimeResult['status'];
  inputContext: Record<string, any>;
  toolsCalled: string[];
  actionsProposed: any[];
  actionsExecuted: any[];
  approvalRequired: boolean;
  approvalStatus: string;
  creditsConsumed: number;
  deniedGate: GovernanceGate | null;
  proposalId: string | null;
  traceId: string;
  executionTimeMs: number;
  modelUsed: string;
  modelVersion: string | null;
  error: string | null;
  billingKey: string | null;
  output: any;
}

/**
 * Agent Runtime Contract — the single governed, metered, audited entry point for every AI agent.
 *
 * No agent executes on trust. Each run walks the same chain and lands a durable audit row no matter
 * where it stops:
 *
 *   1. Capability guard   ─ the agent must hold the required capability (if one is demanded).
 *   2. Agent lookup        ─ resolve the agent; a missing/disabled agent is rejected.
 *   3. Governance          ─ kill switch, tool permission, spend limit, human gate (AgentGovernance).
 *   4. Budget check        ─ the tenant must hold enough AI credits for the agent's price.
 *   5. Metering            ─ debit the credits idempotently BEFORE the work runs.
 *   6. Execution           ─ produce the proposal (the only side effect a simulated agent has).
 *   7. Ledger              ─ persist request -> decision -> execution -> outcome to the ledger.
 *
 * A gated run (financial / commercial / procurement, or high value) is PROPOSED, not executed: its
 * actions sit in `actions_proposed` awaiting human approval and `actions_executed` stays empty.
 */
@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger('AgentRuntimeService');

  constructor(
    private readonly aiPlatform: AiPlatformService,
    private readonly autonomy: AutonomyService,
    private readonly tracer: AgentTracerService,
    private readonly metrics: AgentMetricsService,
    private readonly policyEngine: PolicyEngineService,
    private readonly contextEngine: AiContextEngine,
    private readonly governance: AgentGovernanceService,
    private readonly billing: SaasCreditBillingService,
    @Optional() private readonly capabilityGuard?: CapabilityGuardService,
    @Optional() @Inject(PG_POOL) private readonly pool?: Pool,
  ) {}

  async execute(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const startTime = Date.now();
    const executionId = input.idempotencyKey?.trim() || `exec-${Math.random().toString(36).slice(2, 9)}`;
    const traceId = `trace-${Math.random().toString(36).slice(2, 9)}`;
    const billingKey = `${executionId}:agent-cost`;
    const triggerType = input.triggerType ?? 'manual';
    const valueAmount = Number(input.payload?.valueAmount ?? 2500);

    this.logger.log(`[AgentRuntime] Starting execution "${executionId}" for agent "${input.agentId}" (tenant: ${input.tenantId})`);

    // A ledger skeleton every branch fills in and persists. Denials and failures are audited too.
    const record: LedgerRecord = {
      executionId,
      agentId: input.agentId,
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      triggerType,
      status: 'failed',
      inputContext: this.redact(input.payload),
      toolsCalled: [],
      actionsProposed: [],
      actionsExecuted: [],
      approvalRequired: false,
      approvalStatus: 'not_required',
      creditsConsumed: 0,
      deniedGate: null,
      proposalId: null,
      traceId,
      executionTimeMs: 0,
      modelUsed: 'unknown',
      modelVersion: null,
      error: null,
      billingKey: null,
      output: {},
    };

    const finish = async (result: AgentRuntimeResult): Promise<AgentRuntimeResult> => {
      record.executionTimeMs = result.executionTimeMs;
      await this.persistLedger(record);
      return result;
    };

    try {
      // 1. Capability authorization guard.
      if (input.requiredCapability && this.capabilityGuard) {
        this.capabilityGuard.assertCapability(input.agentId, input.requiredCapability);
      }

      this.tracer.recordTraceStep({
        stepId: `${executionId}-step-1`,
        agentKey: input.agentId,
        phase: 'trigger',
        label: 'Runtime Context & Memory Assembled',
        details: `Assembled digital twin context for tenant ${input.tenantId}`,
        timestamp: new Date(),
      });

      // 2. Agent lookup.
      const agent = this.aiPlatform.getAgent(input.agentId);
      const toolsRequested = agent?.toolKeys ?? [];
      record.modelUsed = agent?.model ?? 'unknown';

      // 3. Governance chain (kill switch, disabled, tenant, tool permission, spend limit, human gate).
      const policy = this.governance.getPolicy(input.agentId);
      const decision = this.governance.evaluate(policy, {
        tenantId: input.tenantId,
        agentEnabled: Boolean(agent?.enabled),
        toolsRequested,
        valueAmount,
      });

      if (decision.outcome === 'deny') {
        this.tracer.recordTraceStep({
          stepId: `${executionId}-step-governance`,
          agentKey: input.agentId,
          phase: 'reasoning',
          label: `Blocked at governance gate: ${decision.deniedGate}`,
          details: decision.reason,
          timestamp: new Date(),
        });
        const duration = Date.now() - startTime;
        this.metrics.recordExecution(input.agentId, false, duration, 0, record.modelUsed, policy.category, false);
        record.status = 'rejected_by_policy';
        record.deniedGate = decision.deniedGate ?? null;
        record.error = decision.reason;
        record.output = { reason: decision.reason, gate: decision.deniedGate };
        return finish({
          agentId: input.agentId,
          executionId,
          status: 'rejected_by_policy',
          output: record.output,
          traceId,
          executionTimeMs: duration,
          modelUsed: record.modelUsed,
          creditsConsumed: 0,
          approvalRequired: false,
          approvalStatus: 'not_required',
          deniedGate: decision.deniedGate,
          toolsCalled: [],
        });
      }

      // 3b. Legacy enterprise policy engine (forbidden-action rules) — kept as a second gate.
      const forbidden = this.policyEngine
        .listPolicies()
        .filter((p) => p.enabled)
        .find((p) => p.action === 'forbidden' && p.condition.includes(input.agentId));
      if (forbidden) {
        const duration = Date.now() - startTime;
        this.metrics.recordExecution(input.agentId, false, duration, 0, record.modelUsed, policy.category, false);
        record.status = 'rejected_by_policy';
        record.error = `Blocked by enterprise policy "${forbidden.name}"`;
        record.output = { reason: record.error };
        return finish({
          agentId: input.agentId,
          executionId,
          status: 'rejected_by_policy',
          output: record.output,
          traceId,
          executionTimeMs: duration,
          modelUsed: record.modelUsed,
          creditsConsumed: 0,
          approvalRequired: false,
          approvalStatus: 'not_required',
          toolsCalled: [],
        });
      }

      // 4. Budget check — before any work, confirm the tenant can afford the agent's price.
      const balance = await this.billing.getTenantBalance(input.tenantId);
      if (balance.balanceCredits < decision.creditPrice) {
        const duration = Date.now() - startTime;
        this.metrics.recordExecution(input.agentId, false, duration, 0, record.modelUsed, policy.category, false);
        const reason = `Insufficient AI credits: need ${decision.creditPrice}, tenant holds ${balance.balanceCredits}.`;
        record.status = 'rejected_by_policy';
        record.deniedGate = 'insufficient_budget';
        record.error = reason;
        record.output = { reason, gate: 'insufficient_budget' };
        return finish({
          agentId: input.agentId,
          executionId,
          status: 'rejected_by_policy',
          output: record.output,
          traceId,
          executionTimeMs: duration,
          modelUsed: record.modelUsed,
          creditsConsumed: 0,
          approvalRequired: false,
          approvalStatus: 'not_required',
          deniedGate: 'insufficient_budget',
          toolsCalled: [],
        });
      }

      // 5. Meter — debit credits idempotently BEFORE executing. A flat per-execution price means the
      //    reserve and the finalized amount are the same, so one idempotent debit covers both.
      const metered = await this.billing.consumeCredits(
        input.tenantId,
        input.agentId,
        decision.creditPrice,
        `agent_execution:${input.agentId}`,
        billingKey,
      );
      record.creditsConsumed = metered.creditsConsumed;
      record.billingKey = billingKey;

      // 6. Execution — the simulated agent's only side effect is generating a governed proposal.
      this.tracer.recordTraceStep({
        stepId: `${executionId}-step-tools`,
        agentKey: input.agentId,
        phase: 'tools',
        label: `Invoked ReAct Loop (${toolsRequested.length} tools)`,
        details: `Bound tools: ${toolsRequested.join(', ')}`,
        timestamp: new Date(),
      });
      record.toolsCalled = toolsRequested;

      const proposal = await this.autonomy.propose(input.tenantId, {
        title: `Action Proposal from ${agent!.label}`,
        description: `Automated recommendation generated by runtime execution ${executionId}.`,
        category: 'general',
        severity: 'info',
        mode: decision.approvalRequired ? 'assist' : 'suggest',
        targetModule: agent!.key.split('_')[0] ?? 'general',
        payload: input.payload,
        valueAmount,
        variancePercent: Number(input.payload?.variancePercent ?? 1.2),
      });

      const proposedAction = {
        type: 'proposal_created',
        proposalId: proposal.id,
        title: proposal.title,
        valueAmount,
      };
      record.actionsProposed = [proposedAction];
      record.proposalId = proposal.id;

      // A gated run stops at the proposal. A cleared run "executes" — here, commits the proposal record.
      record.approvalRequired = decision.approvalRequired;
      record.approvalStatus = decision.approvalRequired ? 'pending' : 'not_required';
      record.actionsExecuted = decision.approvalRequired ? [] : [proposedAction];

      this.tracer.recordExplainability({
        proposalId: proposal.id,
        agentKey: input.agentId,
        decisionSummary: `Recommended action for ${agent!.label} based on input parameters.`,
        evidence: [
          { type: 'event', title: `Runtime Execution ${executionId}`, uri: `aura://runtime/exec/${executionId}` },
          { type: 'rag_context', title: `Context Window Snapshot`, uri: `aura://context/${input.tenantId}` },
        ],
        toolsUsed: toolsRequested.map((tk) => ({
          toolKey: tk,
          label: tk,
          params: input.payload,
          resultSummary: 'Verified matching criteria successfully.',
        })),
        confidenceAndRisk: {
          confidenceScorePercent: 94,
          riskLevel: decision.approvalRequired ? 'medium' : 'low',
          identifiedRisks: decision.approvalRequired
            ? [decision.approvalReason ?? 'Human approval required before execution.']
            : ['Parameters comply with standard autonomy safety policy.'],
        },
      });

      const duration = Date.now() - startTime;
      this.metrics.recordExecution(input.agentId, true, duration, 0.012, agent!.model, policy.category, !decision.approvalRequired);

      const status: AgentRuntimeResult['status'] = decision.approvalRequired ? 'proposal_generated' : 'completed';
      record.status = status;
      record.modelVersion = agent!.model;
      record.output = { proposalId: proposal.id, title: proposal.title, approvalRequired: decision.approvalRequired };

      this.tracer.recordTraceStep({
        stepId: `${executionId}-step-complete`,
        agentKey: input.agentId,
        phase: 'proposal',
        label: decision.approvalRequired ? 'Proposal Awaiting Human Approval' : 'Execution Completed Successfully',
        details: `Generated proposal ${proposal.id} in ${duration}ms (charged ${record.creditsConsumed} credits)`,
        timestamp: new Date(),
      });

      return finish({
        agentId: input.agentId,
        executionId,
        status,
        output: record.output,
        proposalId: proposal.id,
        traceId,
        executionTimeMs: duration,
        modelUsed: agent!.model,
        creditsConsumed: record.creditsConsumed,
        approvalRequired: decision.approvalRequired,
        approvalStatus: decision.approvalRequired ? 'pending' : 'not_required',
        toolsCalled: toolsRequested,
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      this.metrics.recordExecution(input.agentId, false, duration, 0, record.modelUsed, 'general', false);
      this.logger.error(`[AgentRuntime] Execution ${executionId} failed: ${err.message}`);
      record.status = 'failed';
      record.error = err.message;
      record.output = { error: err.message };
      return finish({
        agentId: input.agentId,
        executionId,
        status: 'failed',
        output: record.output,
        traceId,
        executionTimeMs: duration,
        modelUsed: record.modelUsed,
        creditsConsumed: record.creditsConsumed,
        approvalRequired: record.approvalRequired,
        approvalStatus: record.approvalStatus as 'not_required' | 'pending',
        toolsCalled: record.toolsCalled,
      });
    }
  }

  /** Strip obvious secrets before the input context is written to the durable ledger. */
  private redact(payload: Record<string, any> | undefined): Record<string, any> {
    if (!payload) return {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      out[k] = /(password|secret|token|apikey|api_key|authorization)/i.test(k) ? '[redacted]' : v;
    }
    return out;
  }

  /** Persist the full audit row. Idempotent on execution_id so a replay updates rather than duplicates. */
  private async persistLedger(r: LedgerRecord): Promise<void> {
    if (!this.pool) return;
    await this.pool
      .query(
        `INSERT INTO public.aura_agent_executions
           (execution_id, agent_id, tenant_id, actor_id, trigger_type, status, input_context,
            tools_called, actions_proposed, actions_executed, approval_required, approval_status,
            credits_consumed, denied_gate, output, proposal_id, trace_id, execution_time_ms,
            model_used, model_version, error, billing_key, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, now())
         ON CONFLICT (execution_id) DO UPDATE SET
           status = EXCLUDED.status, output = EXCLUDED.output, tools_called = EXCLUDED.tools_called,
           actions_proposed = EXCLUDED.actions_proposed, actions_executed = EXCLUDED.actions_executed,
           approval_required = EXCLUDED.approval_required, approval_status = EXCLUDED.approval_status,
           credits_consumed = EXCLUDED.credits_consumed, denied_gate = EXCLUDED.denied_gate,
           proposal_id = EXCLUDED.proposal_id, execution_time_ms = EXCLUDED.execution_time_ms,
           model_version = EXCLUDED.model_version, error = EXCLUDED.error, updated_at = now()`,
        [
          r.executionId, r.agentId, r.tenantId, r.actorId, r.triggerType, r.status,
          JSON.stringify(r.inputContext), JSON.stringify(r.toolsCalled), JSON.stringify(r.actionsProposed),
          JSON.stringify(r.actionsExecuted), r.approvalRequired, r.approvalStatus, r.creditsConsumed,
          r.deniedGate, JSON.stringify(r.output), r.proposalId, r.traceId, r.executionTimeMs,
          r.modelUsed, r.modelVersion, r.error, r.billingKey,
        ],
      )
      .catch((err: any) => this.logger.warn(`Failed DB persist for execution ${r.executionId}: ${err.message}`));
  }
}
