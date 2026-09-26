import { Inject, Injectable } from '@nestjs/common';
import { type Id, makeDealMember, makeEvent, sameTenantOrNull, CRM_OPPORTUNITY_DEPTH_EVENT } from '@aura/shared';
import { EVENT_STORE, type EventStore, TX_RUNNER, type TxRunner } from '@aura/core';
import { CRM_PRESALES_ASSIGNMENT_STORE, type PreSalesAssignmentStore } from './presales-assignment-store';
import { CRM_OPPORTUNITY_DEPTH_STORE, type OpportunityDepthStore } from './opportunity-depth-store';
import { CRM_OPPORTUNITY_STORE, type OpportunityStore } from './opportunity-store';
import { CRM_PRE_AWARD_PACKAGE_STORE, type PreAwardPackageStore } from './pre-award-package-store';
import { handOverTechnicalStudy } from './domain/technical-study';
import {
  type PreSalesAssignment, type PreSalesAssignmentAct, type PreSalesPackageInput, PRESALES_ASSIGNMENT_EVENT,
  acceptPreSalesAssignment, acknowledgePreSalesReturn, assertAssignmentAccepted, assertStudyFollowsAssignment,
  completePreSalesAssignment, declinePreSalesAssignment, makePreSalesAssignment, reissuePreSalesAssignment,
} from './domain/presales-assignment';

type StudyFacts = { id?: Id; authorId: Id; reviewerId: Id; inputRevision: string };

/**
 * The Pre-Sales study assignment (STU-01), under the owner's decision of 2026-09-26 — see
 * domain/presales-assignment.ts. This service owns its lifecycle; the study routes ask it two things:
 * may this study act happen under the assignment, and — once a study is approved — complete it.
 */
@Injectable()
export class PreSalesAssignmentService {
  constructor(
    @Inject(CRM_PRESALES_ASSIGNMENT_STORE) private readonly store: PreSalesAssignmentStore,
    @Inject(CRM_OPPORTUNITY_DEPTH_STORE) private readonly depth: OpportunityDepthStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(TX_RUNNER) private readonly tx: TxRunner,
    @Inject(CRM_OPPORTUNITY_STORE) private readonly opportunities: OpportunityStore,
    @Inject(CRM_PRE_AWARD_PACKAGE_STORE) private readonly packages: PreAwardPackageStore,
  ) {}

  forOpportunity(tenantId: Id, opportunityId: Id): Promise<PreSalesAssignment | null> {
    return this.store.forOpportunity(tenantId, opportunityId);
  }

  /** What waits on `userId`, with the opportunity each one is for — a work list names the deal. */
  async listAwaiting(tenantId: Id, userId: Id): Promise<Array<PreSalesAssignment & { opportunityTitle: string | null }>> {
    const rows = await this.store.listAwaiting(tenantId, userId);
    return Promise.all(rows.map(async (a) => ({ ...a, opportunityTitle: sameTenantOrNull(await this.opportunities.get(a.opportunityId), tenantId)?.title ?? null })));
  }

  async get(tenantId: Id, id: Id): Promise<PreSalesAssignment | null> {
    return this.store.get(tenantId, id);
  }

  /** Assign an opportunity that has no assignment yet (the lead conversion assigns in its own transaction). */
  async assign(input: PreSalesPackageInput & { tenantId: Id; companyId: Id | null; opportunityId: Id; actorId: Id; assigneeName: string; reviewerName: string }): Promise<PreSalesAssignment> {
    const existing = await this.store.forOpportunity(input.tenantId, input.opportunityId);
    if (existing) throw new Error(`this opportunity already has a Pre-Sales assignment (version ${existing.version}); it can only be changed by reissuing it`);
    const assignment = makePreSalesAssignment({ ...input, assignedBy: input.actorId });
    const members = this.members(assignment, input.assigneeName, input.reviewerName);
    await this.tx.run(async (handle) => {
      await this.store.saveWithClient(handle, assignment);
      for (const member of members) await this.depth.saveDealMemberWithClient(handle, member);
      await this.events.appendWithClient(handle, [this.event(assignment, 'assigned', input.actorId), ...members.map((m) => this.memberEvent(assignment, m, input.actorId))]);
    });
    return assignment;
  }

  /** The two deal-team rows an assignment implies: DMS reads the reviewer's access to intake from them. */
  members(a: PreSalesAssignment, assigneeName: string, reviewerName: string) {
    return [
      makeDealMember({
        tenantId: a.tenantId, opportunityId: a.opportunityId, userId: a.assigneeId, userName: assigneeName, role: 'PRESALES',
        responsibility: `Study ${a.deliverables.join(', ')} from input revision ${a.inputRevision}; reviewer ${a.reviewerId}`,
      }),
      makeDealMember({
        tenantId: a.tenantId, opportunityId: a.opportunityId, userId: a.reviewerId, userName: reviewerName, role: 'TECHNICAL_REVIEWER',
        responsibility: `Review the Pre-Sales study based on input revision ${a.inputRevision}`,
      }),
    ];
  }

  async accept(tenantId: Id, id: Id, actorId: Id): Promise<PreSalesAssignment> {
    return this.apply(tenantId, id, actorId, 'accepted', (a) => acceptPreSalesAssignment(a, actorId));
  }

  async decline(tenantId: Id, id: Id, actorId: Id, reason: string): Promise<PreSalesAssignment> {
    return this.apply(tenantId, id, actorId, 'declined', (a) => declinePreSalesAssignment(a, actorId, reason));
  }

  async acknowledge(tenantId: Id, id: Id, actorId: Id): Promise<PreSalesAssignment> {
    return this.apply(tenantId, id, actorId, 'acknowledged', (a) => acknowledgePreSalesReturn(a, actorId));
  }

  /**
   * Sales changes the package. A new engineer or reviewer replaces the old one on the deal team —
   * the reviewer's deal-team row is what grants read access to the Sales intake, so a replaced
   * reviewer must not keep it.
   */
  async reissue(input: {
    tenantId: Id; opportunityId: Id; actorId: Id; reason: string; changes: Partial<PreSalesPackageInput>;
    assigneeName?: string; reviewerName?: string;
  }): Promise<PreSalesAssignment> {
    const current = await this.store.forOpportunity(input.tenantId, input.opportunityId);
    if (!current) throw new Error('Pre-Sales assignment for this opportunity not found — assign it before reissuing');
    const next = reissuePreSalesAssignment(current, input.actorId, input.changes, input.reason);
    const team = await this.depth.listDealTeam({ tenantId: input.tenantId, opportunityId: input.opportunityId });
    const replaced = team.filter((m) =>
      (m.role === 'PRESALES' && m.userId === current.assigneeId && next.assigneeId !== current.assigneeId)
      || (m.role === 'TECHNICAL_REVIEWER' && m.userId === current.reviewerId && next.reviewerId !== current.reviewerId));
    const [engineer, reviewer] = this.members(next, input.assigneeName ?? next.assigneeId, input.reviewerName ?? next.reviewerId);
    const added = [
      ...(next.assigneeId !== current.assigneeId ? [engineer] : []),
      ...(next.reviewerId !== current.reviewerId ? [reviewer] : []),
    ];
    // The unfinished study revision goes with the package: the new engineer continues it, and a
    // revision already in review waits for the reviewer the package now names.
    const pkg = await this.packages.getByOpportunity(input.tenantId, input.opportunityId);
    const open = pkg ? (await this.packages.listStudies(input.tenantId, pkg.id))
      .filter((s) => s.status === 'draft' || s.status === 'changes_requested' || s.status === 'in_review').at(-1) : undefined;
    const handedOver = open && (open.authorId !== next.assigneeId || open.reviewerId !== next.reviewerId)
      ? handOverTechnicalStudy(open, { authorId: next.assigneeId, reviewerId: next.reviewerId }) : null;
    await this.tx.run(async (handle) => {
      await this.store.saveWithClient(handle, next);
      if (handedOver) await this.packages.saveStudyWithClient(handle, handedOver);
      for (const member of added) await this.depth.saveDealMemberWithClient(handle, member);
      await this.events.appendWithClient(handle, [this.event(next, 'reissued', input.actorId), ...added.map((m) => this.memberEvent(next, m, input.actorId))]);
    });
    for (const member of replaced) await this.depth.deleteDealMember(member.id);
    return next;
  }

  /**
   * THE BINDING, asked before any study act on a direct opportunity. No assignment: the study is
   * unassigned and the rule does not apply. An assignment: it must have been accepted, and the
   * study must be its engineer's, for its reviewer, on its input revision.
   */
  async assertStudyAct(tenantId: Id, opportunityId: Id, study: StudyFacts): Promise<void> {
    const a = await this.store.forOpportunity(tenantId, opportunityId);
    if (!a) return;
    assertAssignmentAccepted(a);
    assertStudyFollowsAssignment(a, study);
  }

  /** The approved study completes the package it answers; Sales receives it in My Work. */
  async completeOnApproval(tenantId: Id, opportunityId: Id, study: Required<StudyFacts>, actorId: Id): Promise<PreSalesAssignment | null> {
    const a = await this.store.forOpportunity(tenantId, opportunityId);
    if (!a || a.status === 'completed') return a;
    const done = completePreSalesAssignment(a, study, actorId);
    await this.tx.run(async (handle) => {
      await this.store.saveWithClient(handle, done);
      await this.events.appendWithClient(handle, [this.event(done, 'completed', actorId)]);
    });
    return done;
  }

  private async apply(tenantId: Id, id: Id, actorId: Id, act: PreSalesAssignmentAct, change: (a: PreSalesAssignment) => PreSalesAssignment): Promise<PreSalesAssignment> {
    const current = await this.store.get(tenantId, id);
    if (!current) throw new Error(`Pre-Sales assignment ${id} not found`);
    const next = change(current);
    await this.tx.run(async (handle) => {
      await this.store.saveWithClient(handle, next);
      await this.events.appendWithClient(handle, [this.event(next, act, actorId)]);
    });
    return next;
  }

  event(a: PreSalesAssignment, act: PreSalesAssignmentAct, actorId: Id) {
    return makeEvent({
      type: PRESALES_ASSIGNMENT_EVENT[act], tenantId: a.tenantId, companyId: a.companyId, actorId,
      aggregateType: 'crm.presales_assignment', aggregateId: a.id,
      payload: {
        opportunityId: a.opportunityId, version: a.version, status: a.status, assigneeId: a.assigneeId,
        reviewerId: a.reviewerId, inputRevision: a.inputRevision, dueDate: a.dueDate,
        reason: a.history.at(-1)?.note ?? null, studyId: a.studyId,
      },
    });
  }

  private memberEvent(a: PreSalesAssignment, m: ReturnType<typeof makeDealMember>, actorId: Id) {
    return makeEvent({
      type: CRM_OPPORTUNITY_DEPTH_EVENT.dealMemberAdded, tenantId: a.tenantId, companyId: a.companyId, actorId,
      aggregateType: 'crm.opportunity', aggregateId: a.opportunityId,
      payload: { memberId: m.id, userId: m.userId, role: m.role },
    });
  }
}
