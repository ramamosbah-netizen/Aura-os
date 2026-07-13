import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Id, makeEvent,
  type OpportunityStakeholder, type NewOpportunityStakeholder, makeStakeholder,
  type OpportunityDealMember, type NewOpportunityDealMember, makeDealMember,
  type Commitment, type NewCommitment, makeCommitment, fulfilCommitment, transitionCommitment,
  type StakeholderCoverage, stakeholderCoverage, type CommitmentSummary, commitmentSummary,
  CRM_OPPORTUNITY_DEPTH_EVENT,
} from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { CRM_OPPORTUNITY_DEPTH_STORE, type OpportunityDepthStore } from './opportunity-depth-store';

export interface OpportunityDepth {
  stakeholders: OpportunityStakeholder[];
  coverage: StakeholderCoverage;
  dealTeam: OpportunityDealMember[];
  commitments: Commitment[];
  commitmentSummary: CommitmentSummary;
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

  /** The full depth payload for an Opportunity 360 — stakeholders + coverage, team, commitments + summary. */
  async depthFor(tenantId: Id, opportunityId: Id): Promise<OpportunityDepth> {
    const [stakeholders, dealTeam, commitments] = await Promise.all([
      this.store.listStakeholders({ tenantId, opportunityId }),
      this.store.listDealTeam({ tenantId, opportunityId }),
      this.store.listCommitments({ tenantId, relatedType: 'opportunity', relatedId: opportunityId }),
    ]);
    return {
      stakeholders,
      coverage: stakeholderCoverage(stakeholders),
      dealTeam,
      commitments,
      commitmentSummary: commitmentSummary(commitments),
    };
  }
}
