import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore, PG_POOL } from '@aura/core';
import type { Pool } from 'pg';

/**
 * Autonomy modes — the 4 escalation levels from passive observation to full automation.
 * Each mode determines how much human involvement is required before action execution.
 */
export type AutonomyMode = 'observe' | 'suggest' | 'assist' | 'operate';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed';
export type ProposalSeverity = 'info' | 'warning' | 'critical';
export type ProposalCategory = 'pricing' | 'cost' | 'approval' | 'risk' | 'general';

/**
 * An autonomy proposal — an AI-suggested action that the Intelligence layer recommends
 * a business module should take. Proposals flow through the autonomy pipeline:
 *   Observe → Suggest → Assist → Operate
 */
export interface AutonomyProposal {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  category: ProposalCategory;
  severity: ProposalSeverity;
  mode: AutonomyMode;
  targetModule: string | null;
  targetAction: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  valueAmount: number | null;
  status: ProposalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

/** Safety threshold: proposals valued above this amount require human confirmation. */
const OPERATE_VALUE_LIMIT = 10_000;

/** Safety threshold: budget variance above this % forces Assist mode. */
const OPERATE_VARIANCE_LIMIT = 5;

export const AUTONOMY_PROPOSED_EVENT = 'intelligence.autonomy.proposed';
export const AUTONOMY_EXECUTED_EVENT = 'intelligence.autonomy.executed';
export const AUTONOMY_REJECTED_EVENT = 'intelligence.autonomy.rejected';

/**
 * Autonomy Engine — manages the proposal queue and enforces safety thresholds.
 *
 * The engine creates proposals from intelligence observations (cost overruns, 3-way
 * mismatches, pricing anomalies), determines the appropriate autonomy mode based on
 * value and risk, and queues them for human review or auto-execution.
 *
 * Safety rules:
 * - `Operate` mode: auto-execute only when value ≤ $10,000 and variance ≤ 5%.
 * - `Assist` mode: present the action with a single-click approve button.
 * - `Suggest` mode: present the recommendation without an action trigger.
 * - `Observe` mode: log the observation silently (audit only).
 */
@Injectable()
export class AutonomyService {
  private readonly logger = new Logger('Intelligence:Autonomy');

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /**
   * Create a new autonomy proposal. The mode is auto-determined from the value and
   * variance thresholds unless explicitly overridden.
   */
  async propose(
    tenantId: string,
    input: {
      title: string;
      description?: string;
      category?: ProposalCategory;
      severity?: ProposalSeverity;
      mode?: AutonomyMode;
      targetModule?: string;
      targetAction?: string;
      targetId?: string;
      payload?: Record<string, unknown>;
      valueAmount?: number;
      variancePercent?: number;
    },
    actorId: Id | null = null,
  ): Promise<AutonomyProposal> {
    // Determine the effective autonomy mode using safety thresholds.
    let mode = input.mode ?? 'suggest';
    if (mode === 'operate') {
      mode = resolveMode(input.valueAmount ?? 0, input.variancePercent ?? 0);
    }

    const res = await this.pool.query(
      `INSERT INTO public.aura_autonomy_proposals
         (tenant_id, title, description, category, severity, mode,
          target_module, target_action, target_id, payload, value_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        input.title,
        input.description ?? null,
        input.category ?? 'general',
        input.severity ?? 'info',
        mode,
        input.targetModule ?? null,
        input.targetAction ?? null,
        input.targetId ?? null,
        JSON.stringify(input.payload ?? {}),
        input.valueAmount ?? null,
      ],
    );

    const proposal = mapProposal(res.rows[0]);

    await this.events.append([
      makeEvent({
        type: AUTONOMY_PROPOSED_EVENT,
        tenantId,
        actorId,
        aggregateType: 'intelligence.autonomy',
        aggregateId: proposal.id,
        payload: { title: proposal.title, mode, category: proposal.category, severity: proposal.severity },
      }),
    ]);

    this.logger.log(`Proposal created: "${proposal.title}" [${mode}] for tenant ${tenantId}.`);
    return proposal;
  }

  /** List proposals for a tenant, optionally filtered by status. */
  async list(tenantId: string, status?: ProposalStatus): Promise<AutonomyProposal[]> {
    const sql = status
      ? 'SELECT * FROM public.aura_autonomy_proposals WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM public.aura_autonomy_proposals WHERE tenant_id = $1 ORDER BY created_at DESC';
    const params = status ? [tenantId, status] : [tenantId];
    const res = await this.pool.query(sql, params);
    return res.rows.map(mapProposal);
  }

  /** Execute (approve + run) a proposal. */
  async execute(tenantId: string, proposalId: string, decidedBy: string | null = null): Promise<AutonomyProposal> {
    const res = await this.pool.query(
      `UPDATE public.aura_autonomy_proposals
       SET status = 'executed', decided_by = $3, decided_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [proposalId, tenantId, decidedBy],
    );
    if (res.rows.length === 0) throw new Error(`Proposal ${proposalId} not found.`);

    const proposal = mapProposal(res.rows[0]);

    await this.events.append([
      makeEvent({
        type: AUTONOMY_EXECUTED_EVENT,
        tenantId,
        actorId: decidedBy,
        aggregateType: 'intelligence.autonomy',
        aggregateId: proposal.id,
        payload: { title: proposal.title, targetModule: proposal.targetModule, targetAction: proposal.targetAction },
      }),
    ]);

    this.logger.log(`Proposal executed: "${proposal.title}" by ${decidedBy ?? 'system'}.`);
    return proposal;
  }

  /** Reject a proposal. */
  async reject(tenantId: string, proposalId: string, decidedBy: string | null = null): Promise<AutonomyProposal> {
    const res = await this.pool.query(
      `UPDATE public.aura_autonomy_proposals
       SET status = 'rejected', decided_by = $3, decided_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [proposalId, tenantId, decidedBy],
    );
    if (res.rows.length === 0) throw new Error(`Proposal ${proposalId} not found.`);

    const proposal = mapProposal(res.rows[0]);

    await this.events.append([
      makeEvent({
        type: AUTONOMY_REJECTED_EVENT,
        tenantId,
        actorId: decidedBy,
        aggregateType: 'intelligence.autonomy',
        aggregateId: proposal.id,
        payload: { title: proposal.title },
      }),
    ]);

    this.logger.log(`Proposal rejected: "${proposal.title}" by ${decidedBy ?? 'system'}.`);
    return proposal;
  }
}

// ── Pure helpers (exported for unit testing) ─────────────────────────────────

/**
 * Determine the effective autonomy mode from safety thresholds.
 * - value ≤ $10,000 AND variance ≤ 5% → Operate (auto-execute)
 * - Otherwise → Assist (human single-click)
 */
export function resolveMode(valueAmount: number, variancePercent: number): AutonomyMode {
  if (valueAmount <= OPERATE_VALUE_LIMIT && Math.abs(variancePercent) <= OPERATE_VARIANCE_LIMIT) {
    return 'operate';
  }
  return 'assist';
}

// ── Row mapper ───────────────────────────────────────────────────────────────

function mapProposal(r: any): AutonomyProposal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    title: r.title,
    description: r.description,
    category: r.category,
    severity: r.severity,
    mode: r.mode,
    targetModule: r.target_module,
    targetAction: r.target_action,
    targetId: r.target_id,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
    valueAmount: r.value_amount != null ? Number(r.value_amount) : null,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at ? new Date(r.decided_at) : null,
    createdAt: new Date(r.created_at),
  };
}
