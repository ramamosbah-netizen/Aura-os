import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type AccessTarget, assertSameTenant, type Id, makeEvent, type OrgLevel, sameTenantOrNull } from '@aura/shared';
import { AccessService, AiService, EVENT_STORE, type EventStore, TenantContext, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_EVENT, type Opportunity, type OpportunityStage, type AwardSource, type NewOpportunity, makeOpportunity, mergeWinPlan, winPlanCoverage, type WinPlan, type WinPlanCoverage } from '@aura/shared';
import {
  type PursuitDecision, type PursuitDimensions, scorePursuit, CRM_JOURNEY_EVENT,
  checkStageTransition, stageGateMessage, type StageEvidence,
} from '@aura/shared';
import { CRM_OPPORTUNITY_STORE, type OpportunityFilter, type OpportunityStore } from './opportunity-store';
import { OPPORTUNITY_GOVERNANCE_RESOLVER, type OpportunityGovernanceResolver } from './opportunity-governance';

@Injectable()
export class OpportunityService {
  private readonly logger = new Logger('CRM-Opportunities');

  constructor(
    @Inject(CRM_OPPORTUNITY_STORE) private readonly store: OpportunityStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    private readonly ai: AiService,
    // Slice 9 PR-2 — MANDATORY (never @Optional): the governed-Won invariant is enforced here, so the
    // classifier must always be present. If it cannot classify, a manual close fails (fail-closed).
    @Inject(OPPORTUNITY_GOVERNANCE_RESOLVER) private readonly governance: OpportunityGovernanceResolver,
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
  ) {}

  async create(input: NewOpportunity & { actorId?: Id | null }): Promise<Opportunity> {
    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: input.tenantId }];
      if (input.companyId) orgPath.push({ level: 'company', id: input.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(input.actorId, target);
    }

    const opportunity = makeOpportunity(input);
    const event = makeEvent({
      type: CRM_EVENT.opportunityCreated,
      tenantId: opportunity.tenantId,
      companyId: opportunity.companyId,
      actorId: input.actorId ?? null,
      aggregateType: 'crm.opportunity',
      aggregateId: opportunity.id,
      payload: {
        title: opportunity.title,
        value: opportunity.value,
        stage: opportunity.stage,
        accountId: opportunity.accountId,
        accountName: opportunity.accountName,
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.createWithClient(handle, opportunity);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Opportunity created: ${opportunity.title} (${opportunity.id})`);
    return opportunity;
  }

  /**
   * §14 — merge a Win Plan patch (only known keys survive, whitespace → null) and return the
   * updated deal with the derived coverage. Coverage is judged against deal SIZE: a small deal
   * with the need and the play recorded reads complete; a strategic one expects the full plan.
   */
  async updateWinPlan(id: Id, patch: Partial<Record<keyof WinPlan, string | null>>): Promise<{ opportunity: Opportunity; coverage: WinPlanCoverage }> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);
    const updated: Opportunity = { ...existing, winPlan: mergeWinPlan(existing.winPlan, patch), updatedAt: new Date().toISOString() };
    await this.store.update(updated);
    this.logger.log(`Win plan updated: ${updated.title} (${updated.id})`);
    return { opportunity: updated, coverage: winPlanCoverage(updated.winPlan, updated.value) };
  }

  async update(
    id: Id,
    updates: Partial<Pick<Opportunity, 'title' | 'value' | 'stage' | 'winProbability' | 'forecastCategory' | 'closeDate' | 'accountId' | 'accountName' | 'executionType' | 'requiresTender' | 'ownerId' | 'nextAction' | 'nextActionDueDate' | 'budgetConfirmed' | 'authorityConfirmed' | 'needConfirmed' | 'timelineConfirmed' | 'competitors' | 'source' | 'lossReason' | 'winReason' | 'buyingStage'>>,
    actorId?: Id | null,
    /**
     * G5 — evidence for the stage gate (quotations/stakeholders live outside this aggregate, so
     * the composition layer supplies them, exactly like G2's activity facts). Omitted ⇒ unproven,
     * never satisfied.
     */
    evidence: StageEvidence = {},
  ): Promise<Opportunity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);

    if (actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(actorId, target);
    }

    // Drop undefined keys — a sparse PATCH must never overwrite existing values
    // (requires_tender is NOT NULL; an undefined would 500 at the store).
    const defined = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const updated: Opportunity = {
      ...existing,
      ...defined,
      updatedAt: new Date().toISOString(),
    };
    // Keep the pair in sync from whichever side was set: executionType is the truth, requiresTender
    // its derived shadow. Setting executionType updates the boolean; a legacy boolean-only PATCH
    // maps back to an executionType so the two never disagree.
    if (updates.executionType !== undefined) updated.requiresTender = updates.executionType === 'tender';
    else if (updates.requiresTender !== undefined) updated.executionType = updates.requiresTender ? 'tender' : 'direct_sale';

    const isStageChange = updates.stage && updates.stage !== existing.stage;

    // Tender ownership — enforced in the DOMAIN, not the dropdown. Once a tender owns this deal
    // (`tenderId` set: Start Tender, or a tender registered directly and back-linked), the
    // opportunity is a projection of the tender: its commercial stages and route are the tender's to
    // drive. The PUBLIC update can NEVER move it — the ONLY writer of a tender deal's outcome is the
    // dedicated internal `applyTenderOutcome`. This is the "no two owners of the deal" invariant.
    if (existing.tenderId != null) {
      const to = updates.stage;
      if (isStageChange && (to === 'proposal' || to === 'negotiation' || to === 'won' || to === 'lost')) {
        throw new Error(`only the linked tender can move this deal to ${to} — a tender-route deal's commercial progression is owned by its tender, not the opportunity`);
      }
      if (updates.executionType !== undefined && updates.executionType !== 'tender') {
        throw new Error(`only after its tender is closed can this deal leave the tender route — it is owned by the linked tender`);
      }
    }

    // Slice 9 PR-2 — a GOVERNED deal cannot be Won from the generic dropdown. The invariant lives in
    // the SERVICE (not the controller/UI), so a direct API call or any other internal caller is bound
    // by it too. Classification is resolved through a narrow, MANDATORY, fail-closed port: if
    // governance cannot be determined, the manual close FAILS rather than assuming legacy. Winning a
    // governed deal is the customer accepting its quotation (the authoritative `applyAwardOutcome`
    // reactor) or an authorized explicit override (`overrideAwardOutcome`) — never this path.
    if (isStageChange && updates.stage === 'won') {
      const classification = await this.governance.classify({ id: existing.id, tenantId: existing.tenantId, tenderId: existing.tenderId });
      if (classification === 'tender_owned') {
        throw new Error(`only the linked tender can move this deal to won — a tender-route deal's outcome is owned by its tender, not the opportunity`);
      }
      if (classification === 'direct_governed') {
        throw new Error(`only the customer accepting its quotation can win a governed deal — record the acceptance, or use the governed manual override with a reason`);
      }
      // 'direct_legacy' — no Pre-Award chain to protect; the legacy manual close is temporarily allowed.
    }

    // G5 — a commercial stage transition must carry its evidence (§40.6).
    //
    // The candidate carries the POST-patch FIELDS but the PRE-patch STAGE, and both halves matter:
    //  - post-patch fields, because setting the win reason and the stage in ONE patch is the
    //    natural way to close a deal; gating on stored fields would refuse it for lacking a reason
    //    the same request supplies.
    //  - pre-patch stage, because `updated.stage` is already the destination — passing it whole
    //    makes the gate read `to === opp.stage` and wave every transition through as a no-op.
    //    That silently made this gate inert until an e2e proved a win still landed with no reason.
    if (isStageChange) {
      const to = updates.stage as OpportunityStage;
      const check = checkStageTransition({ ...updated, stage: existing.stage }, to, evidence);
      if (!check.allowed) throw new Error(stageGateMessage(to, check.gaps));
    }

    const eventType = isStageChange ? CRM_EVENT.opportunityStageChanged : CRM_EVENT.opportunityUpdated;

    const event = makeEvent({
      type: eventType,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: actorId ?? null,
      aggregateType: 'crm.opportunity',
      aggregateId: updated.id,
      // Carry the opportunity title + value + client account so the deal-chain reactor
      // names the auto-created tender after the opportunity and carries the client
      // snapshot down the chain (tender → contract → project).
      payload: {
        title: updated.title,
        stage: updated.stage,
        value: updated.value,
        accountId: updated.accountId,
        accountName: updated.accountName,
        requiresTender: updated.requiresTender,
        oldStage: existing.stage,
        changes: updates,
      },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Opportunity updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  /**
   * Stamp the tender that OWNS this deal's commercial progression (Start Tender, or a tender
   * registered directly and back-linked). From here the opportunity is a projection of the tender —
   * the update() guard refuses any manual commercial stage/route change. Idempotent: re-stamping the
   * same tender is a no-op; it never changes stage.
   */
  async markTenderOwned(id: Id, tenderId: Id): Promise<Opportunity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);
    if (existing.tenderId === tenderId) return existing;
    const updated: Opportunity = {
      ...existing,
      tenderId,
      // A tender-owned deal is a tender route by definition — keep the pair honest.
      executionType: 'tender',
      requiresTender: true,
      updatedAt: new Date().toISOString(),
    };
    const event = makeEvent({
      type: CRM_EVENT.opportunityUpdated,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'crm.opportunity',
      aggregateId: updated.id,
      payload: { tenderId, changes: { tenderId, executionType: 'tender' } },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Opportunity ${updated.id} now owned by tender ${tenderId} (commercial progression locked to the tender)`);
    return updated;
  }

  /**
   * The SINGLE sanctioned writer of a tender-route deal's outcome — called only by the tender
   * award/loss reactor (crm.opportunity's public update refuses won/lost while `tenderId` is set).
   * A no-op if the deal is already closed, so an at-least-once redelivery is idempotent. Supplies the
   * reason (and, for a win, a value) the stage gate requires so the programmatic close passes the
   * same evidence gate a human would.
   */
  async applyTenderOutcome(
    id: Id,
    outcome: 'won' | 'lost',
    detail: { reason: string; value?: number },
  ): Promise<Opportunity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);
    if (existing.stage === 'won' || existing.stage === 'lost') return existing; // already closed
    const now = new Date().toISOString();
    const updated: Opportunity = {
      ...existing,
      stage: outcome,
      ...(outcome === 'won'
        ? { winReason: detail.reason, value: existing.value > 0 ? existing.value : (detail.value ?? existing.value) }
        : { lossReason: detail.reason }),
      updatedAt: now,
    };
    const event = makeEvent({
      type: CRM_EVENT.opportunityStageChanged,
      tenantId: updated.tenantId,
      companyId: updated.companyId,
      actorId: null,
      aggregateType: 'crm.opportunity',
      aggregateId: updated.id,
      payload: {
        title: updated.title, stage: updated.stage, value: updated.value,
        accountId: updated.accountId, accountName: updated.accountName,
        requiresTender: updated.requiresTender, oldStage: existing.stage,
        changes: { stage: outcome }, viaTender: existing.tenderId,
      },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Opportunity ${updated.id} closed ${outcome} by its tender ${existing.tenderId} (${detail.reason})`);
    return updated;
  }

  /**
   * Slice 9 — the sanctioned writer that closes a DIRECT deal Won from a verified customer AWARD
   * (an accepted quotation). Distinct from the manual UI close: its evidence is the award itself —
   * a verified quotation, an authoritative baseline value, and the P↔Q lineage the caller checked —
   * so it does NOT run the human stage gate or fabricate a `winReason` to slip through a UI rule.
   *
   * Idempotency is IDENTITY-based, not merely state-based:
   *  - open deal                              → close Won, stamp award provenance.
   *  - already Won from the SAME quotation     → no-op (a safe event replay).
   *  - already Won from a DIFFERENT quotation  → CONFLICT: never overwrite; emit an anomaly event so a
   *                                              later award can never silently rewrite an earlier one.
   *  - already Lost, or tender-owned           → left untouched.
   */
  async applyAwardOutcome(
    id: Id,
    award: { awardedQuotationId: Id; contractedValue: number; valueSource: 'commercial_baseline' | 'legacy_quotation_total'; reason: string; source: AwardSource },
  ): Promise<{ opportunity: Opportunity; outcome: 'won' | 'noop_same_award' | 'award_conflict' | 'skipped_closed' | 'skipped_tender' }> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);

    // A tender-owned deal is closed by its tender, never by a quotation acceptance.
    if (existing.tenderId) return { opportunity: existing, outcome: 'skipped_tender' };

    if (existing.stage === 'won') {
      if (existing.awardedQuotationId === award.awardedQuotationId) return { opportunity: existing, outcome: 'noop_same_award' };
      // A DIFFERENT quotation's award arrived for an already-won deal — record the anomaly, do NOT overwrite.
      await this.events.append([makeEvent({
        type: CRM_EVENT.opportunityAwardConflict, tenantId: existing.tenantId, companyId: existing.companyId, actorId: null,
        aggregateType: 'crm.opportunity', aggregateId: existing.id,
        payload: { existingAwardedQuotationId: existing.awardedQuotationId, incomingQuotationId: award.awardedQuotationId, existingContractedValue: existing.contractedValue, incomingContractedValue: award.contractedValue },
      })]);
      this.logger.warn(`Award conflict on opportunity ${existing.id}: already awarded from ${existing.awardedQuotationId}; refused ${award.awardedQuotationId} — award NOT overwritten`);
      return { opportunity: existing, outcome: 'award_conflict' };
    }
    if (existing.stage === 'lost') return { opportunity: existing, outcome: 'skipped_closed' };

    const now = new Date().toISOString();
    const updated: Opportunity = {
      ...existing,
      stage: 'won',
      winReason: award.reason,
      contractedValue: award.contractedValue,
      awardedQuotationId: award.awardedQuotationId,
      awardSource: award.source,
      awardedAt: now,
      updatedAt: now,
    };
    const event = makeEvent({
      type: CRM_EVENT.opportunityStageChanged,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId: null,
      aggregateType: 'crm.opportunity', aggregateId: updated.id,
      payload: {
        title: updated.title, stage: 'won', value: updated.value, contractedValue: updated.contractedValue,
        accountId: updated.accountId, accountName: updated.accountName, requiresTender: updated.requiresTender, oldStage: existing.stage,
        changes: { stage: 'won' }, awardedQuotationId: award.awardedQuotationId, awardSource: award.source, valueSource: award.valueSource,
      },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });
    this.logger.log(`Opportunity ${updated.id} WON from quotation ${award.awardedQuotationId} (contractedValue ${award.contractedValue}, ${award.valueSource})`);
    return { opportunity: updated, outcome: 'won' };
  }

  /**
   * Slice 9 PR-2 — the EXPLICIT manual override: close a deal Won out-of-band (a real award that
   * happened outside AURA), authorized in the controller by `crm.opportunity.override`. This is NOT
   * the generic dropdown — it is a distinct, audited action. The invariant is re-checked HERE (not
   * only the controller): a tender-owned deal can never be overridden (its tender owns the outcome).
   *
   * Money: `contractedValue` is ONLY what the authorized user entered explicitly (or null) — the
   * forecast `opportunity.value` is NEVER promoted to a contracted value. `valueSource` is
   * `manual_override`, and an audit event records the reason, evidence reference and the warning that
   * no authoritative accepted quotation backs it. Idempotent: replaying the same override is a no-op.
   */
  async overrideAwardOutcome(
    id: Id,
    override: { reason: string; contractedValue?: number | null; evidenceReference?: string | null; actorId: Id | null },
  ): Promise<Opportunity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);

    // Re-classify the invariant in the SERVICE — the controller did authorization, but ownership is ours.
    const classification = await this.governance.classify({ id: existing.id, tenantId: existing.tenantId, tenderId: existing.tenderId });
    if (classification === 'tender_owned') {
      throw new Error(`only the linked tender can close this deal — a tender-route deal's outcome cannot be manually overridden`);
    }
    if (existing.stage === 'won') {
      if (existing.awardSource === 'manual_override') return existing; // idempotent replay of the override
      throw new Error(`opportunity ${id} is already won — a manual override cannot rewrite an existing award`);
    }
    if (existing.stage === 'lost') throw new Error(`opportunity ${id} is already lost`);
    if (!override.reason?.trim()) throw new Error('a manual override requires a reason');

    const now = new Date().toISOString();
    const contractedValue = override.contractedValue ?? null; // explicit only — never opportunity.value
    const updated: Opportunity = {
      ...existing,
      stage: 'won',
      winReason: override.reason.trim(),
      contractedValue,
      awardSource: 'manual_override',
      awardedAt: now,
      updatedAt: now,
    };
    const stageEvent = makeEvent({
      type: CRM_EVENT.opportunityStageChanged,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId: override.actorId ?? null,
      aggregateType: 'crm.opportunity', aggregateId: updated.id,
      payload: {
        title: updated.title, stage: 'won', value: updated.value, contractedValue,
        accountId: updated.accountId, accountName: updated.accountName, requiresTender: updated.requiresTender, oldStage: existing.stage,
        changes: { stage: 'won' }, awardSource: 'manual_override', valueSource: 'manual_override',
      },
    });
    const auditEvent = makeEvent({
      type: CRM_EVENT.opportunityAwardOverride,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId: override.actorId ?? null,
      aggregateType: 'crm.opportunity', aggregateId: updated.id,
      payload: {
        opportunityId: id, actorId: override.actorId ?? null, reason: override.reason.trim(),
        evidenceReference: override.evidenceReference?.trim() || null, contractedValue,
        previousStage: existing.stage, warning: 'No authoritative accepted quotation',
      },
    });
    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [stageEvent, auditEvent]);
    });
    this.logger.warn(`Opportunity ${id} WON by MANUAL OVERRIDE (no accepted-quotation evidence) by ${override.actorId ?? 'unknown'} — ${override.reason.trim()}`);
    return updated;
  }

  /** Record a Pursue / No-Pursue decision — computes the score from the assessment dimensions and
   * stamps who decided + when. The decision is kept even when NO_PURSUE (a rejected pursuit is
   * history, not a delete). */
  async recordPursuit(
    id: Id,
    input: { decision: PursuitDecision; dimensions?: PursuitDimensions | null; rationale?: string | null; actorId?: Id | null },
  ): Promise<Opportunity> {
    const existing = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);

    if (input.actorId) {
      const orgPath: Array<{ level: OrgLevel; id: Id }> = [{ level: 'tenant', id: existing.tenantId }];
      if (existing.companyId) orgPath.push({ level: 'company', id: existing.companyId });
      const target: AccessTarget = { permission: 'crm.account.create', orgPath };
      this.access.assert(input.actorId, target);
    }

    const now = new Date().toISOString();
    const dimensions = input.dimensions ?? null;
    const updated: Opportunity = {
      ...existing,
      pursuitDecision: input.decision,
      pursuitScore: dimensions ? scorePursuit(dimensions) : existing.pursuitScore,
      pursuitDimensions: dimensions ?? existing.pursuitDimensions,
      pursuitRationale: input.rationale?.trim() || existing.pursuitRationale,
      pursuitDecidedBy: input.actorId ?? null,
      pursuitDecidedAt: now,
      updatedAt: now,
    };

    const event = makeEvent({
      type: CRM_JOURNEY_EVENT.pursuitDecided,
      tenantId: updated.tenantId, companyId: updated.companyId, actorId: input.actorId ?? null,
      aggregateType: 'crm.opportunity', aggregateId: updated.id,
      payload: { decision: updated.pursuitDecision, score: updated.pursuitScore },
    });

    await this.tx.run(async (handle) => {
      await this.store.updateWithClient(handle, updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Pursuit decided: ${updated.title} (${updated.id}) → ${updated.pursuitDecision} (score ${updated.pursuitScore})`);
    return updated;
  }

  async forecastWinProbability(id: Id): Promise<{ winProbability: number; reason: string }> {
    const opp = assertSameTenant(await this.store.get(id), this.tenant?.boundTenantId(), 'Opportunity', id);

    // Let's create an AI prompt requesting a realistic forecast based on metrics
    const prompt = `You are the AURA OS CRM AI Intelligence agent.
Forecast the win probability (0 to 100) for this opportunity:
- Title: "${opp.title}"
- Value: $${opp.value}
- Current Stage: "${opp.stage}"
- Target Close Date: ${opp.closeDate ?? 'Not set'}

Analyze the risk and market factors for typical infrastructure/ERP deals.
Provide your response strictly in the following JSON format:
{
  "winProbability": <number between 0 and 100>,
  "reason": "<one sentence explanation of why this probability was predicted>"
}`;

    try {
      const result = await this.ai.complete({
        messages: [{ role: 'user', content: prompt }],
        system: 'You are an expert sales analyst agent.',
      });

      // parse the JSON response
      const cleanJson = result.text.substring(result.text.indexOf('{'), result.text.lastIndexOf('}') + 1);
      const parsed = JSON.parse(cleanJson);
      
      const prob = Number(parsed.winProbability);
      if (Number.isFinite(prob) && prob >= 0 && prob <= 100) {
        return {
          winProbability: prob,
          reason: String(parsed.reason || 'AI analysis completed.'),
        };
      }
    } catch (e) {
      this.logger.warn(`AI forecast failed: ${e}. Falling back to default heuristics.`);
    }

    // Default heuristic fallback
    const defaults: Record<OpportunityStage, number> = {
      qualification: 20,
      proposal: 50,
      negotiation: 80,
      won: 100,
      lost: 0,
    };
    return {
      winProbability: defaults[opp.stage] ?? 20,
      reason: 'Calculated using standard baseline sales conversion parameters.',
    };
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<Opportunity | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: OpportunityFilter): Promise<Opportunity[]> {
    return this.store.list(filter);
  }

  listPaged(filter: OpportunityFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
