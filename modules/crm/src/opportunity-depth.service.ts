import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Id, makeEvent,
  type OpportunityStakeholder, type NewOpportunityStakeholder, makeStakeholder,
  type OpportunityDealMember, type NewOpportunityDealMember, makeDealMember,
  type Commitment, type NewCommitment, makeCommitment, fulfilCommitment, transitionCommitment,
  type StakeholderCoverage, stakeholderCoverage, type CommitmentSummary, commitmentSummary,
  type DealRegisterItem, type NewDealRegisterItem, type RegisterStatus, type RegisterSummary,
  makeRegisterItem, resolveRegisterItem, registerSummary,
  type BuyingStage, buyingJourneyAlignment,
  type OpportunityRisk, type NewOpportunityRisk, type RiskStatus, type RiskSummary,
  makeRisk, updateRisk, setRiskStatus, riskSummary,
  type OpportunityHealth, assessOpportunityHealth,
  CRM_OPPORTUNITY_DEPTH_EVENT, CRM_REGISTER_EVENT, CRM_RISK_EVENT,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { CRM_OPPORTUNITY_DEPTH_STORE, type OpportunityDepthStore } from './opportunity-depth-store';

export interface OpportunityDepth {
  stakeholders: OpportunityStakeholder[];
  coverage: StakeholderCoverage;
  dealTeam: OpportunityDealMember[];
  commitments: Commitment[];
  commitmentSummary: CommitmentSummary;
  register: DealRegisterItem[];
  registerSummary: RegisterSummary;
  risks: OpportunityRisk[];
  riskSummary: RiskSummary;
  /** The composed, explainable per-dimension health roll-up (S7 + risk register). */
  health: OpportunityHealth;
}

/** Opportunity execution depth — stakeholders, deal team, commitments. Events emitted on the
 * spine (non-transactional writes, mirroring ActivityService). */
@Injectable()
export class OpportunityDepthService {
  private readonly logger = new Logger('CRM-OppDepth');

  constructor(
    @Inject(CRM_OPPORTUNITY_DEPTH_STORE) private readonly store: OpportunityDepthStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  // ── Stakeholders ──
  async addStakeholder(input: NewOpportunityStakeholder & { actorId?: Id | null }): Promise<OpportunityStakeholder> {
    const s = makeStakeholder(input);
    await this.store.saveStakeholder(s);
    await this.events.append([makeEvent({
      type: CRM_OPPORTUNITY_DEPTH_EVENT.stakeholderAdded, tenantId: s.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: s.opportunityId,
      payload: { stakeholderId: s.id, contactName: s.contactName, role: s.role },
    })]);
    return s;
  }
  async updateStakeholder(
    id: Id,
    patch: Partial<Pick<OpportunityStakeholder, 'role' | 'influence' | 'decisionPower' | 'sentiment' | 'isChampion' | 'isPrimary' | 'notes' | 'contactName'>>,
  ): Promise<OpportunityStakeholder> {
    const existing = await this.store.getStakeholder(id);
    if (!existing) throw new Error(`Stakeholder ${id} not found`);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated: OpportunityStakeholder = { ...existing, ...defined, updatedAt: new Date().toISOString() };
    await this.store.saveStakeholder(updated);
    return updated;
  }
  removeStakeholder(id: Id): Promise<void> { return this.store.deleteStakeholder(id); }
  listStakeholders(tenantId: Id, opportunityId: Id): Promise<OpportunityStakeholder[]> {
    return this.store.listStakeholders({ tenantId, opportunityId });
  }

  // ── Deal team ──
  async addDealMember(input: NewOpportunityDealMember & { actorId?: Id | null }): Promise<OpportunityDealMember> {
    const m = makeDealMember(input);
    await this.store.saveDealMember(m);
    await this.events.append([makeEvent({
      type: CRM_OPPORTUNITY_DEPTH_EVENT.dealMemberAdded, tenantId: m.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: m.opportunityId,
      payload: { memberId: m.id, userId: m.userId, role: m.role },
    })]);
    return m;
  }
  removeDealMember(id: Id): Promise<void> { return this.store.deleteDealMember(id); }
  listDealTeam(tenantId: Id, opportunityId: Id): Promise<OpportunityDealMember[]> {
    return this.store.listDealTeam({ tenantId, opportunityId });
  }

  // ── Commitments ──
  async addCommitment(input: NewCommitment & { actorId?: Id | null }): Promise<Commitment> {
    const c = makeCommitment(input);
    await this.store.saveCommitment(c);
    await this.events.append([makeEvent({
      type: CRM_OPPORTUNITY_DEPTH_EVENT.commitmentCreated, tenantId: c.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.commitment', aggregateId: c.id,
      payload: { relatedType: c.relatedType, relatedId: c.relatedId, direction: c.direction, dueAt: c.dueAt },
    })]);
    return c;
  }
  async fulfilCommitment(id: Id, evidence?: string | null, actorId?: Id | null): Promise<Commitment> {
    const existing = await this.store.getCommitment(id);
    if (!existing) throw new Error(`Commitment ${id} not found`);
    const next = fulfilCommitment(existing, evidence);
    await this.store.saveCommitment(next);
    await this.events.append([makeEvent({
      type: CRM_OPPORTUNITY_DEPTH_EVENT.commitmentFulfilled, tenantId: next.tenantId, companyId: null,
      actorId: actorId ?? null, aggregateType: 'crm.commitment', aggregateId: next.id,
      payload: { relatedType: next.relatedType, relatedId: next.relatedId },
    })]);
    return next;
  }
  async transitionCommitment(id: Id, to: 'BROKEN' | 'CANCELLED', actorId?: Id | null): Promise<Commitment> {
    const existing = await this.store.getCommitment(id);
    if (!existing) throw new Error(`Commitment ${id} not found`);
    const next = transitionCommitment(existing, to);
    await this.store.saveCommitment(next);
    if (to === 'BROKEN') {
      await this.events.append([makeEvent({
        type: CRM_OPPORTUNITY_DEPTH_EVENT.commitmentBroken, tenantId: next.tenantId, companyId: null,
        actorId: actorId ?? null, aggregateType: 'crm.commitment', aggregateId: next.id,
        payload: { relatedType: next.relatedType, relatedId: next.relatedId },
      })]);
    }
    return next;
  }
  listCommitments(tenantId: Id, relatedType: string, relatedId: Id): Promise<Commitment[]> {
    return this.store.listCommitments({ tenantId, relatedType, relatedId });
  }

  // ── Deal register (decisions / assumptions / open questions) ──
  async addRegisterItem(input: NewDealRegisterItem & { actorId?: Id | null }): Promise<DealRegisterItem> {
    const item = makeRegisterItem(input);
    await this.store.saveRegisterItem(item);
    await this.events.append([makeEvent({
      type: CRM_REGISTER_EVENT.itemAdded, tenantId: item.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: item.relatedId,
      payload: { itemId: item.id, kind: item.kind, statement: item.statement },
    })]);
    return item;
  }
  async resolveRegisterItem(id: Id, to: RegisterStatus, detail?: string | null, actorId?: Id | null): Promise<DealRegisterItem> {
    const existing = await this.store.getRegisterItem(id);
    if (!existing) throw new Error(`Register item ${id} not found`);
    const next = resolveRegisterItem(existing, to, detail, actorId);
    await this.store.saveRegisterItem(next);
    await this.events.append([makeEvent({
      type: CRM_REGISTER_EVENT.itemResolved, tenantId: next.tenantId, companyId: null,
      actorId: actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: next.relatedId,
      payload: { itemId: next.id, kind: next.kind, status: next.status },
    })]);
    return next;
  }
  listRegisterItems(tenantId: Id, relatedType: string, relatedId: Id): Promise<DealRegisterItem[]> {
    return this.store.listRegisterItems({ tenantId, relatedType, relatedId });
  }

  // ── Risk register ──
  async addRisk(input: NewOpportunityRisk & { actorId?: Id | null }): Promise<OpportunityRisk> {
    const k = makeRisk(input);
    await this.store.saveRisk(k);
    await this.events.append([makeEvent({
      type: CRM_RISK_EVENT.added, tenantId: k.tenantId, companyId: null,
      actorId: input.actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: k.opportunityId,
      payload: { riskId: k.id, type: k.type, severity: k.severity, title: k.title },
    })]);
    return k;
  }
  async updateRisk(
    id: Id,
    patch: Partial<Pick<OpportunityRisk, 'type' | 'title' | 'description' | 'likelihood' | 'impact' | 'evidence' | 'owner' | 'mitigation' | 'targetDate'>>,
  ): Promise<OpportunityRisk> {
    const existing = await this.store.getRisk(id);
    if (!existing) throw new Error(`Risk ${id} not found`);
    const next = updateRisk(existing, patch);
    await this.store.saveRisk(next);
    return next;
  }
  async setRiskStatus(id: Id, status: RiskStatus, actorId?: Id | null): Promise<OpportunityRisk> {
    const existing = await this.store.getRisk(id);
    if (!existing) throw new Error(`Risk ${id} not found`);
    const next = setRiskStatus(existing, status);
    await this.store.saveRisk(next);
    await this.events.append([makeEvent({
      type: CRM_RISK_EVENT.statusChanged, tenantId: next.tenantId, companyId: null,
      actorId: actorId ?? null, aggregateType: 'crm.opportunity', aggregateId: next.opportunityId,
      payload: { riskId: next.id, status: next.status, severity: next.severity },
    })]);
    return next;
  }
  listRisks(tenantId: Id, opportunityId: Id): Promise<OpportunityRisk[]> {
    return this.store.listRisks({ tenantId, opportunityId });
  }

  /** The full depth payload for an Opportunity 360 — stakeholders + coverage, team, commitments,
   * and the decisions/assumptions/open-questions register, each with its derived summary, plus the
   * composed health roll-up. `opp` (sales + buying stage) is optional: without it the buying-journey
   * dimension is simply not assessed and the health folds the remaining three signals. */
  async depthFor(
    tenantId: Id,
    opportunityId: Id,
    opp?: { stage: string; buyingStage: BuyingStage | null } | null,
  ): Promise<OpportunityDepth> {
    const [stakeholders, dealTeam, commitments, register, risks] = await Promise.all([
      this.store.listStakeholders({ tenantId, opportunityId }),
      this.store.listDealTeam({ tenantId, opportunityId }),
      this.store.listCommitments({ tenantId, relatedType: 'opportunity', relatedId: opportunityId }),
      this.store.listRegisterItems({ tenantId, relatedType: 'opportunity', relatedId: opportunityId }),
      this.store.listRisks({ tenantId, opportunityId }),
    ]);
    const coverage = stakeholderCoverage(stakeholders);
    const commitSummary = commitmentSummary(commitments);
    const regSummary = registerSummary(register);
    const rskSummary = riskSummary(risks);
    const alignment = buyingJourneyAlignment(opp?.stage ?? '', opp?.buyingStage ?? null);
    return {
      stakeholders,
      coverage,
      dealTeam,
      commitments,
      commitmentSummary: commitSummary,
      register,
      registerSummary: regSummary,
      risks,
      riskSummary: rskSummary,
      health: assessOpportunityHealth({ coverage, commitments: commitSummary, register: regSummary, alignment, risks: rskSummary }),
    };
  }
}
