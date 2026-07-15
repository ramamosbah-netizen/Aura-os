import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AccessTarget, type Id, type OrgLevel, makeEvent } from '@aura/shared';
import { AccessService, EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner, AiService } from '@aura/core';
import { CRM_EVENT, type Opportunity, type OpportunityStage, type NewOpportunity, makeOpportunity } from '@aura/shared';
import {
  type PursuitDecision, type PursuitDimensions, scorePursuit, CRM_JOURNEY_EVENT,
  checkStageTransition, stageGateMessage, type StageEvidence,
} from '@aura/shared';
import { CRM_OPPORTUNITY_STORE, type OpportunityFilter, type OpportunityStore } from './opportunity-store';

@Injectable()
export class OpportunityService {
  private readonly logger = new Logger('CRM-Opportunities');

  constructor(
    @Inject(CRM_OPPORTUNITY_STORE) private readonly store: OpportunityStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    private readonly access: AccessService,
    private readonly ai: AiService,
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

  async update(
    id: Id,
    updates: Partial<Pick<Opportunity, 'title' | 'value' | 'stage' | 'winProbability' | 'closeDate' | 'accountId' | 'accountName' | 'requiresTender' | 'ownerId' | 'nextAction' | 'nextActionDueDate' | 'budgetConfirmed' | 'authorityConfirmed' | 'needConfirmed' | 'timelineConfirmed' | 'competitors' | 'source' | 'lossReason' | 'winReason' | 'buyingStage'>>,
    actorId?: Id | null,
    /**
     * G5 — evidence for the stage gate (quotations/stakeholders live outside this aggregate, so
     * the composition layer supplies them, exactly like G2's activity facts). Omitted ⇒ unproven,
     * never satisfied.
     */
    evidence: StageEvidence = {},
  ): Promise<Opportunity> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Opportunity ${id} not found`);

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

    const isStageChange = updates.stage && updates.stage !== existing.stage;

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
      await this.store.update(updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Opportunity updated: ${updated.title} (${updated.id})`);
    return updated;
  }

  /** Record a Pursue / No-Pursue decision — computes the score from the assessment dimensions and
   * stamps who decided + when. The decision is kept even when NO_PURSUE (a rejected pursuit is
   * history, not a delete). */
  async recordPursuit(
    id: Id,
    input: { decision: PursuitDecision; dimensions?: PursuitDimensions | null; rationale?: string | null; actorId?: Id | null },
  ): Promise<Opportunity> {
    const existing = await this.store.get(id);
    if (!existing) throw new Error(`Opportunity ${id} not found`);

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
      await this.store.update(updated);
      await this.events.appendWithClient(handle, [event]);
    });

    this.logger.log(`Pursuit decided: ${updated.title} (${updated.id}) → ${updated.pursuitDecision} (score ${updated.pursuitScore})`);
    return updated;
  }

  async forecastWinProbability(id: Id): Promise<{ winProbability: number; reason: string }> {
    const opp = await this.store.get(id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);

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

  get(id: Id): Promise<Opportunity | null> {
    return this.store.get(id);
  }

  list(filter?: OpportunityFilter): Promise<Opportunity[]> {
    return this.store.list(filter);
  }

  listPaged(filter: OpportunityFilter, page: import('@aura/shared').PageParams) {
    return this.store.listPaged(filter, page);
  }
}
