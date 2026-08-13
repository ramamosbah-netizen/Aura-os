import { Injectable, Logger } from '@nestjs/common';

/**
 * Agent Governance — the gate every agent execution passes through BEFORE it runs.
 *
 * The runtime must not execute on trust. A request is checked, in order, against:
 *
 *   1. Kill switch        ─ an operator hard-stop that overrides every other setting.
 *   2. Agent enabled      ─ a disabled agent never runs.
 *   3. Tenant identity     ─ no tenant, no execution (nothing to scope or bill).
 *   4. Tool permission    ─ the agent may only call tools on its allow-list.
 *   5. Spend limit        ─ the per-execution credit price must sit under the policy ceiling.
 *   6. Human approval     ─ financial / commercial / procurement work, or any high-value action,
 *                           may be PROPOSED but its actions are not executed until a human approves.
 *
 * This service is pure policy: it holds the per-agent policy and returns a decision. The live
 * budget check (insufficient_credits) needs the tenant's current balance and stays in the runtime,
 * which reports it back through the same `GovernanceGate` vocabulary so the ledger reads uniformly.
 */

export type GovernanceGate =
  | 'kill_switch'
  | 'agent_disabled'
  | 'tenant_missing'
  | 'tool_permission'
  | 'spend_limit'
  | 'insufficient_budget'
  | 'human_approval';

/** Risk class drives the default human gate: the first three always require approval. */
export type AgentRiskCategory = 'financial' | 'commercial' | 'procurement' | 'operational' | 'advisory';

const GATED_CATEGORIES: readonly AgentRiskCategory[] = ['financial', 'commercial', 'procurement'];

export interface AgentGovernancePolicy {
  agentId: string;
  category: AgentRiskCategory;
  /** Operator hard-stop. When true the agent cannot run regardless of `enabled`. */
  killSwitch: boolean;
  /** Tool allow-list. `'*'` permits any tool the agent declares; otherwise a whitelist. */
  allowedTools: string[] | '*';
  /** Credits charged for one execution of this agent. */
  creditPrice: number;
  /** Ceiling: an execution whose price exceeds this is denied at the spend gate. */
  maxSpendCreditsPerExecution: number;
  /** When true, actions are always proposed for human approval, never auto-executed. */
  humanGate: boolean;
  /** A proposed action valued at or above this (in currency units) also forces approval. */
  humanApprovalValueThreshold: number;
}

export interface GovernanceContext {
  tenantId?: string | null;
  agentEnabled: boolean;
  toolsRequested: string[];
  valueAmount: number;
}

export interface GovernanceDecision {
  outcome: 'allow' | 'needs_approval' | 'deny';
  approvalRequired: boolean;
  approvalReason?: string;
  deniedGate?: GovernanceGate;
  reason: string;
  creditPrice: number;
}

@Injectable()
export class AgentGovernanceService {
  private readonly logger = new Logger('AgentGovernanceService');
  private readonly overrides = new Map<string, AgentGovernancePolicy>();

  /**
   * TEMPORARY COMPATIBILITY LAYER — not the intended architecture.
   *
   * AgentDefinition carries no `category`, so an unconfigured agent is classified from its key by
   * keyword. This keeps P7-01 self-contained, but string-matching agent ids is exactly what a policy
   * engine should NOT rely on: it silently misclassifies as the agent roster grows.
   *
   * Source of truth SHOULD move to the agent manifest (category, tools, creditPrice, spendLimit,
   * approvalPolicy, capabilities) with governance reading declared fields instead of guessing. Until
   * then, an explicit `setPolicy(agentId, ...)` override always wins over this heuristic.
   */
  classify(agentId: string): AgentRiskCategory {
    const id = agentId.toLowerCase();
    if (/(cfo|finance|financial|cost|invoice|payment|cashflow|budget)/.test(id)) return 'financial';
    if (/(procure|purchase|_po_|\bpo\b|supplier|vendor)/.test(id)) return 'procurement';
    if (/(quotation|commercial|estimation|estimate|tender|bid|sales|pricing)/.test(id)) return 'commercial';
    if (/(risk|copilot|briefing|advisor|insight|radar)/.test(id)) return 'advisory';
    return 'operational';
  }

  /**
   * PROPOSED default pricing — NOT confirmed business requirements.
   *
   * These per-execution credit prices, the 50-credit spend ceiling, and the 10,000 approval
   * threshold below are placeholder policy defaults so the metering path is exercisable end-to-end.
   * They must be ratified against a real pricing/governance specification before production and
   * treated as configuration (per tenant/plan), not as facts baked into code. Same keyword caveat
   * as `classify` applies.
   */
  private defaultCreditPrice(agentId: string): number {
    const id = agentId.toLowerCase();
    if (/estimation|estimate|boq/.test(id)) return 15;
    if (/(cashflow|cfo|cost_variance)/.test(id)) return 12;
    if (/tender|bid/.test(id)) return 10;
    if (/quotation/.test(id)) return 8;
    if (/(executive|copilot|briefing)/.test(id)) return 5;
    if (/(radar|sales)/.test(id)) return 2;
    return 5;
  }

  /** The effective policy for an agent — an operator override if set, else a category default. */
  getPolicy(agentId: string): AgentGovernancePolicy {
    const existing = this.overrides.get(agentId);
    if (existing) return existing;

    const category = this.classify(agentId);
    return {
      agentId,
      category,
      killSwitch: false,
      allowedTools: '*',
      creditPrice: this.defaultCreditPrice(agentId),
      maxSpendCreditsPerExecution: 50,
      humanGate: GATED_CATEGORIES.includes(category),
      humanApprovalValueThreshold: 10_000,
    };
  }

  /** Run the governance chain. Pure: no side effects, no live balance (see runtime for budget). */
  evaluate(policy: AgentGovernancePolicy, ctx: GovernanceContext): GovernanceDecision {
    const deny = (deniedGate: GovernanceGate, reason: string): GovernanceDecision => ({
      outcome: 'deny',
      approvalRequired: false,
      deniedGate,
      reason,
      creditPrice: policy.creditPrice,
    });

    if (policy.killSwitch) return deny('kill_switch', `Kill switch is engaged for agent "${policy.agentId}".`);
    if (!ctx.agentEnabled) return deny('agent_disabled', `Agent "${policy.agentId}" is disabled.`);
    if (!ctx.tenantId) return deny('tenant_missing', 'No tenant is bound to this execution.');

    if (policy.allowedTools !== '*') {
      const allowed = new Set(policy.allowedTools);
      const forbidden = ctx.toolsRequested.find((t) => !allowed.has(t));
      if (forbidden) {
        return deny('tool_permission', `Tool "${forbidden}" is not on the allow-list for agent "${policy.agentId}".`);
      }
    }

    if (policy.creditPrice > policy.maxSpendCreditsPerExecution) {
      return deny(
        'spend_limit',
        `Execution price ${policy.creditPrice} credits exceeds the per-execution ceiling of ${policy.maxSpendCreditsPerExecution}.`,
      );
    }

    const byCategory = policy.humanGate;
    const byValue = ctx.valueAmount >= policy.humanApprovalValueThreshold;
    if (byCategory || byValue) {
      const approvalReason = byCategory
        ? `${policy.category} actions require human approval`
        : `action value ${ctx.valueAmount} is at or above the ${policy.humanApprovalValueThreshold} approval threshold`;
      return {
        outcome: 'needs_approval',
        approvalRequired: true,
        approvalReason,
        reason: `Approval required: ${approvalReason}.`,
        creditPrice: policy.creditPrice,
      };
    }

    return {
      outcome: 'allow',
      approvalRequired: false,
      reason: 'Cleared all governance gates.',
      creditPrice: policy.creditPrice,
    };
  }

  // ── Operator controls ──────────────────────────────────────────────────────

  /** Set or clear the kill switch for an agent. */
  setKillSwitch(agentId: string, engaged: boolean): AgentGovernancePolicy {
    const policy = { ...this.getPolicy(agentId), killSwitch: engaged };
    this.overrides.set(agentId, policy);
    this.logger.warn(`[Governance] Kill switch ${engaged ? 'ENGAGED' : 'released'} for agent "${agentId}".`);
    return policy;
  }

  /** Patch an agent's policy; unspecified fields keep their effective value. */
  setPolicy(agentId: string, patch: Partial<Omit<AgentGovernancePolicy, 'agentId'>>): AgentGovernancePolicy {
    const policy = { ...this.getPolicy(agentId), ...patch, agentId };
    this.overrides.set(agentId, policy);
    return policy;
  }

  /** All explicitly-configured policies (defaults are computed on demand, not listed here). */
  listPolicies(): AgentGovernancePolicy[] {
    return [...this.overrides.values()];
  }
}
