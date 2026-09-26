import { describe, expect, it, vi } from 'vitest';
import { NullTxRunner, type EventStore } from '@aura/core';
import { makeOpportunity } from '@aura/shared';
import {
  acceptPreSalesAssignment, acknowledgePreSalesReturn, assertAssignmentAccepted, assertStudyFollowsAssignment,
  completePreSalesAssignment, declinePreSalesAssignment, makePreSalesAssignment, reissuePreSalesAssignment,
} from './domain/presales-assignment';
import { InMemoryPreSalesAssignmentStore } from './presales-assignment-store';
import { InMemoryOpportunityDepthStore } from './in-memory-opportunity-depth-store';
import { InMemoryOpportunityStore } from './in-memory-opportunity-store';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { PreSalesAssignmentService } from './presales-assignment.service';
import { makePreAwardPackage } from './domain/pre-award-package';
import { makeTechnicalStudy } from './domain/technical-study';

/**
 * STU-01 — the owner's decision of 2026-09-26: a Sales-assigned study is BOUND to its assignment,
 * the engineer accepts or declines it, and the approved study completes it for Sales to receive.
 */
const pkg = { assigneeId: 'u-eng', reviewerId: 'u-tm', inputRevision: 'Client Rev 01', dueDate: '2026-10-05', deliverables: ['Site survey', 'Technical study'] };
const fresh = () => makePreSalesAssignment({ tenantId: 't1', opportunityId: 'o1', assignedBy: 'u-sales', ...pkg });
const study = { id: 's1', authorId: 'u-eng', reviewerId: 'u-tm', inputRevision: 'Client Rev 01' };

describe('Pre-Sales assignment: the package and its answers', () => {
  it('is a complete package: an independent reviewer, a due date, an input revision and deliverables', () => {
    expect(fresh()).toMatchObject({ version: 1, status: 'assigned', history: [expect.objectContaining({ act: 'assigned', actorId: 'u-sales' })] });
    expect(() => makePreSalesAssignment({ tenantId: 't1', opportunityId: 'o1', assignedBy: 'u-sales', ...pkg, reviewerId: 'u-eng' })).toThrow(/independent/);
    expect(() => makePreSalesAssignment({ tenantId: 't1', opportunityId: 'o1', assignedBy: 'u-sales', ...pkg, deliverables: [' '] })).toThrow(/deliverable/);
    expect(() => makePreSalesAssignment({ tenantId: 't1', opportunityId: 'o1', assignedBy: 'u-sales', ...pkg, dueDate: 'soon' })).toThrow(/due date/);
  });

  it('is accepted by its engineer, once, and by nobody else', () => {
    expect(() => acceptPreSalesAssignment(fresh(), 'u-other')).toThrow(/only the assigned Pre-Sales engineer can accept/);
    const accepted = acceptPreSalesAssignment(fresh(), 'u-eng');
    expect(accepted).toMatchObject({ status: 'accepted', acceptedAt: expect.any(String) });
    expect(() => acceptPreSalesAssignment(accepted, 'u-eng')).toThrow(/is accepted; only an assignment awaiting its engineer/);
  });

  it('is declined with a reason, which returns it to Sales', () => {
    expect(() => declinePreSalesAssignment(fresh(), 'u-eng', ' ')).toThrow(/reason is required/);
    const declined = declinePreSalesAssignment(fresh(), 'u-eng', 'On leave until the 12th');
    expect(declined).toMatchObject({ status: 'declined', declineReason: 'On leave until the 12th' });
    expect(() => assertAssignmentAccepted(declined)).toThrow(/declined this Pre-Sales study; it can only continue once Sales reassigns it/);
  });

  it('is reissued by Sales as a new version, with a reason and a real change, and answered again', () => {
    const declined = declinePreSalesAssignment(fresh(), 'u-eng', 'On leave');
    expect(() => reissuePreSalesAssignment(declined, 'u-sales', {}, 'no change')).toThrow(/must change/);
    expect(() => reissuePreSalesAssignment(declined, 'u-sales', { assigneeId: 'u-eng2' }, '')).toThrow(/reason is required/);
    const next = reissuePreSalesAssignment(declined, 'u-sales', { assigneeId: 'u-eng2' }, 'Reassigned while u-eng is on leave');
    expect(next).toMatchObject({ version: 2, status: 'assigned', assigneeId: 'u-eng2', declineReason: null });
    expect(next.history.map((h) => [h.version, h.act])).toEqual([[1, 'assigned'], [1, 'declined'], [2, 'reissued']]);
  });
});

describe('Pre-Sales assignment: the binding and the return', () => {
  it('refuses a study act before the engineer has accepted', () => {
    expect(() => assertAssignmentAccepted(fresh())).toThrow(/not yet accepted; the study can only start once they accept it/);
  });

  it('binds the study to its engineer, its reviewer and its input revision', () => {
    const a = acceptPreSalesAssignment(fresh(), 'u-eng');
    expect(() => assertStudyFollowsAssignment(a, study)).not.toThrow();
    expect(() => assertStudyFollowsAssignment(a, { ...study, authorId: 'u-eng2' })).toThrow(/only the assigned Pre-Sales engineer can write this study/);
    expect(() => assertStudyFollowsAssignment(a, { ...study, reviewerId: 'u-other-tm' })).toThrow(/the reviewer Sales assigned is u-tm/);
    expect(() => assertStudyFollowsAssignment(a, { ...study, inputRevision: 'Client Rev 02' })).toThrow(/can only follow a reissue by Sales/);
  });

  it('completes on the approved study that answers it, and Sales receives it once', () => {
    expect(() => completePreSalesAssignment(fresh(), study, 'u-tm')).toThrow(/only an accepted assignment can be completed/);
    const done = completePreSalesAssignment(acceptPreSalesAssignment(fresh(), 'u-eng'), study, 'u-tm');
    expect(done).toMatchObject({ status: 'completed', studyId: 's1' });
    expect(() => acknowledgePreSalesReturn(done, 'u-eng')).toThrow(/only u-sales, who assigned this study, can take receipt/);
    const received = acknowledgePreSalesReturn(done, 'u-sales');
    expect(received.acknowledgedAt).toEqual(expect.any(String));
    expect(() => acknowledgePreSalesReturn(received, 'u-sales')).toThrow(/already been received/);
  });
});

describe('PreSalesAssignmentService', () => {
  function harness() {
    const store = new InMemoryPreSalesAssignmentStore();
    const depth = new InMemoryOpportunityDepthStore();
    const opps = new InMemoryOpportunityStore();
    const packages = new InMemoryPreAwardPackageStore();
    const events = { append: vi.fn(), appendWithClient: vi.fn() } as unknown as EventStore;
    const service = new PreSalesAssignmentService(store, depth, events, new NullTxRunner(), opps, packages);
    return { service, store, depth, opps, packages };
  }

  it('lists what waits on each person: the engineer to answer or work, Sales to reassign or receive', async () => {
    const { service, store, opps } = harness();
    const opp = makeOpportunity({ tenantId: 't1', title: 'Warehouse CCTV' } as never);
    await opps.create(opp);
    const a = makePreSalesAssignment({ tenantId: 't1', opportunityId: opp.id, assignedBy: 'u-sales', ...pkg });
    await store.save(a);
    expect((await service.listAwaiting('t1', 'u-eng')).map((r) => [r.status, r.opportunityTitle])).toEqual([['assigned', 'Warehouse CCTV']]);
    expect(await service.listAwaiting('t1', 'u-sales')).toEqual([]);
    await service.decline('t1', a.id, 'u-eng', 'On leave');
    expect(await service.listAwaiting('t1', 'u-eng')).toEqual([]);
    expect((await service.listAwaiting('t1', 'u-sales')).map((r) => r.status)).toEqual(['declined']);
  });

  it('does nothing to an unassigned opportunity, and binds an assigned one', async () => {
    const { service, store } = harness();
    await expect(service.assertStudyAct('t1', 'o-unassigned', study)).resolves.toBeUndefined();
    await store.save(fresh());
    await expect(service.assertStudyAct('t1', 'o1', study)).rejects.toThrow(/not yet accepted/);
  });

  it('a reissue hands the unfinished study, and the deal-team seats, to the people it now names', async () => {
    const { service, store, depth, packages } = harness();
    const a = acceptPreSalesAssignment(fresh(), 'u-eng');
    await store.save(a);
    for (const member of service.members(a, 'Engineer', 'Manager')) await depth.saveDealMember(member);
    const p = makePreAwardPackage({ tenantId: 't1', opportunityId: 'o1', createdBy: 'u-sales' });
    await packages.savePackage(p);
    const draft = makeTechnicalStudy({
      tenantId: 't1', companyId: null, packageId: p.id, title: 'Study', inputRevision: 'Client Rev 01', authorId: 'u-eng', reviewerId: 'u-tm',
      scopeSummary: '', systems: [], requirements: [], surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    }, 1);
    await packages.saveStudy(draft);

    const next = await service.reissue({ tenantId: 't1', opportunityId: 'o1', actorId: 'u-sales', reason: 'u-eng moved to another bid', changes: { assigneeId: 'u-eng2' }, assigneeName: 'Engineer Two' });

    expect(next).toMatchObject({ version: 2, status: 'assigned', assigneeId: 'u-eng2' });
    const [handed] = await packages.listStudies('t1', p.id);
    expect(handed).toMatchObject({ authorId: 'u-eng2', reviewerId: 'u-tm', status: 'draft' });
    const team = await depth.listDealTeam({ tenantId: 't1', opportunityId: 'o1' });
    expect(team.map((m) => [m.role, m.userId]).sort()).toEqual([['PRESALES', 'u-eng2'], ['TECHNICAL_REVIEWER', 'u-tm']]);
  });
});
