import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { ApprovedChecklistFixture } from './approved-checklist.fixture';

/**
 * TC-GATE-1 — the two integrity defects, asserted end to end through the service.
 *
 * These are the behaviours a consultant, a client and a dispute rely on: a failure that stays
 * visible after it is corrected, and a sign-off that cannot be reached by typing over the evidence.
 * They are asserted here rather than only in the domain because both defects lived in the seam
 * BETWEEN the domain and the store — the domain functions were individually reasonable.
 */
const TENANT = 't-gate1';

function service(): { svc: CommissioningService; events: DomainEvent[]; checklists: ApprovedChecklistFixture } {
  const events: DomainEvent[] = [];
  const checklists = new ApprovedChecklistFixture();
  const store = new InMemoryCommissioningStore();
  const eventStore = {
    append: async (batch: DomainEvent[]) => { events.push(...batch); },
    list: async (filter: { tenantId?: string; aggregateId?: string } = {}) =>
      events.filter((e) => (!filter.tenantId || e.tenantId === filter.tenantId) && (!filter.aggregateId || e.aggregateId === filter.aggregateId)),
    listByAggregate: async () => [],
  };
  // The service takes the two collaborators by DI symbol; constructing directly keeps the test on
  // the real code path without a Nest container.
  const svc = new CommissioningService(store as never, eventStore as never, undefined, undefined, undefined, undefined, checklists);
  return { svc, events, checklists };
}

/** A CCTV system created FROM an approved revision whose two points this fixture declares. */
async function systemWithTwoPoints() {
  const { svc, events, checklists } = service();
  const itp = checklists.approve({
    projectId: 'p1', system: 'cctv',
    points: [
      { code: 'PL-034', activity: 'Permanent link', acceptanceCriteria: '≤ 90 m' },
      { code: 'IMG-01', activity: 'Camera image', acceptanceCriteria: 'Image on VMS' },
    ],
  });
  const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV — Tower A', system: 'cctv', itpId: itp.itpId, createdBy: 'u-tc' });
  const points = await svc.listTestItems(rec.id, TENANT);
  const link = points.find((p) => p.pointNo === 'PL-034')!;
  const image = points.find((p) => p.pointNo === 'IMG-01')!;
  return { svc, events, checklists, rec, link, image };
}

describe('TC-GATE-1 — retest lineage', () => {
  it('keeps the failure after the retest passes, and reads the latest run as authoritative', async () => {
    const { svc, rec, link } = await systemWithTwoPoints();

    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', actual: '104.8 m', remarks: 'Over length at patch panel', testedBy: 'u1' });
    const afterFail = await svc.listTestRunsForItem(link.id, TENANT);
    expect(afterFail).toHaveLength(1);
    expect(afterFail[0]).toMatchObject({ runNo: 1, result: 'fail', actual: '104.8 m' });

    const point = await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass', actual: '71.2 m', remarks: 'Re-pulled and re-tested', testedBy: 'u1' });

    // The point now reads pass…
    expect(point.result).toBe('pass');
    expect(point.actual).toBe('71.2 m');

    // …and the failure is still there, with the measurement that caused it.
    const lineage = await svc.listTestRunsForItem(link.id, TENANT);
    expect(lineage.map((r) => `${r.runNo}:${r.result}`)).toEqual(['1:fail', '2:pass']);
    expect(lineage[0].actual).toBe('104.8 m');
    expect(lineage[0].remarks).toMatch(/over length/i);
  });

  it('exposes the whole system’s lineage on the 360 payload', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'Over length' });
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass', actual: '71.2 m' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass', actual: 'Image OK' });

    const detail = await svc.getDetail(rec.id, TENANT);
    expect(detail?.testRuns).toHaveLength(3);
    expect(detail?.testRuns.filter((r) => r.result === 'fail')).toHaveLength(1);
  });

  it('audits every run, and marks the ones that are retests', async () => {
    const { svc, events, rec, link } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'Over length' });
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass', actual: '71.2 m' });

    const runEvents = events.filter((e) => e.type === 'commissioning.test-run.recorded');
    expect(runEvents).toHaveLength(2);
    expect(runEvents[0].payload).toMatchObject({ runNo: 1, result: 'fail', isRetest: false });
    expect(runEvents[1].payload).toMatchObject({ runNo: 2, result: 'pass', isRetest: true });
  });

  it('refuses to record against a system already commissioned', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass' });
    await svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
    await expect(svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'x' })).rejects.toThrow(/already commissioned/i);
  });
});

describe('TC-GATE-1 — the tally cannot contradict the evidence', () => {
  it('refuses a typed tally once the system has a test sheet', async () => {
    const { svc, rec, link } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'Over length' });

    await expect(svc.recordTest(rec.id, TENANT, { pointsPassed: 2, pointsTotal: 2 }))
      .rejects.toThrow(/only a system without an itemized test sheet/i);

    const after = await svc.get(rec.id, TENANT);
    expect(after?.pointsPassed).toBe(0);
    expect(after?.status).toBe('failed');
  });

  it('still allows a typed tally for a system tested without a sheet', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-PA-09', title: 'PA — small system' });
    const tested = await svc.recordTest(rec.id, TENANT, { pointsPassed: 4, pointsTotal: 4 });
    expect(tested.status).toBe('tested');
  });

  it('blocks sign-off while a point stands failed, and allows it once the retest passes', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'Over length' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass', actual: 'Image OK' });

    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' }))
      .rejects.toThrow(/failing — retest required \(PL-034\)/);

    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass', actual: '71.2 m', remarks: 'Re-pulled' });
    const done = await svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
    expect(done.status).toBe('commissioned');
    expect(done.witnessedBy).toBe('Consultant');

    // …and the failure that delayed it is still on the record.
    expect((await svc.listTestRuns(rec.id, TENANT)).filter((r) => r.result === 'fail')).toHaveLength(1);
  });

  it('blocks sign-off while a point has never been executed', async () => {
    const { svc, rec, link } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass' });
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' }))
      .rejects.toThrow(/mandatory point of the approved revision never executed \(IMG-01\)/);
  });

  it('still requires a signer and a witness', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass' });
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: '  ' })).rejects.toThrow(/witnessedBy/i);
  });

  it('still blocks sign-off while a punch item is open', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass' });
    await svc.addPunchItem(rec.id, TENANT, { description: 'Camera 3 out of focus', severity: 'major' });
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).rejects.toThrow(/1 open defect/i);
  });
});

describe('TC-08/TC-09 — T&C executes the approved checklist', () => {
  it('creates the points FROM the approved revision, carrying their lineage', async () => {
    const { rec, link } = await systemWithTwoPoints();
    expect(rec.itpId).toBeTruthy();
    expect(rec.itpRevision).toBe(1);
    expect(rec.itpBoundBy).toBe('u-tc');
    expect(link).toMatchObject({ origin: 'itp', itpId: rec.itpId, itpPointCode: 'PL-034', mandatory: true, expected: '≤ 90 m' });
  });

  it('refuses a hand-typed point on a bound record', async () => {
    const { svc, rec } = await systemWithTwoPoints();
    await expect(svc.addTestItem(rec.id, TENANT, { pointNo: 'X-01', description: 'Extra', expected: 'Anything' }))
      .rejects.toThrow(/hand-typed test point is not allowed/);
    expect(await svc.listTestItems(rec.id, TENANT)).toHaveLength(2);
  });

  it('refuses to commission an unbound record, however its points read', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-02', title: 'CCTV — Tower B', system: 'cctv' });
    const typed = await svc.addTestItem(rec.id, TENANT, { pointNo: 'T-01', description: 'Typed point' });
    await svc.recordTestResult(rec.id, typed.id, TENANT, { result: 'pass' });
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' }))
      .rejects.toThrow(/only a system bound to an approved ITP revision can be commissioned/);
  });

  it('binds an in-progress record, keeps its typed history, and a typed failure still blocks', async () => {
    const { svc, checklists } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-03', title: 'CCTV — Podium', system: 'cctv' });
    const typed = await svc.addTestItem(rec.id, TENANT, { pointNo: 'T-01', description: 'Typed before the checklist' });
    await svc.recordTestResult(rec.id, typed.id, TENANT, { result: 'fail', remarks: 'No image' });
    const itp = checklists.approve({ projectId: 'p1', system: 'cctv', points: [{ code: 'C-01', activity: 'Camera image' }] });

    const bound = await svc.bindChecklist(rec.id, TENANT, itp.itpId, 'u-tc');
    expect(bound.itpId).toBe(itp.itpId);
    const points = await svc.listTestItems(rec.id, TENANT);
    expect(points.map((p) => `${p.pointNo}:${p.origin}`).sort()).toEqual(['C-01:itp', 'T-01:manual']);

    const c01 = points.find((p) => p.pointNo === 'C-01')!;
    await svc.recordTestResult(rec.id, c01.id, TENANT, { result: 'pass' });
    // A recorded failure is not erased by binding.
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).rejects.toThrow(/failing — retest required \(T-01\)/);
    await svc.recordTestResult(rec.id, typed.id, TENANT, { result: 'pass', remarks: 'Retested' });
    expect((await svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).status).toBe('commissioned');
  });

  it('lets a non-mandatory point stay unexecuted', async () => {
    const { svc, checklists } = service();
    const itp = checklists.approve({
      projectId: 'p1', system: 'public_address',
      points: [{ code: 'M-01', activity: 'Zone levels' }, { code: 'O-01', activity: 'Optional survey', mandatory: false }],
    });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-PA-01', title: 'PAVA', system: 'public_address', itpId: itp.itpId, createdBy: 'u-tc' });
    const m01 = (await svc.listTestItems(rec.id, TENANT)).find((p) => p.pointNo === 'M-01')!;
    await svc.recordTestResult(rec.id, m01.id, TENANT, { result: 'pass' });
    expect((await svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).status).toBe('commissioned');
  });

  it('refuses a revision of another project, another system, or one not approved', async () => {
    const { svc, checklists } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-04', title: 'CCTV', system: 'cctv' });
    const otherProject = checklists.approve({ projectId: 'p2', system: 'cctv', points: [{ code: 'C-01', activity: 'x' }] });
    const otherSystem = checklists.approve({ projectId: 'p1', system: 'fire_alarm', points: [{ code: 'F-01', activity: 'x' }] });
    const submitted = checklists.approve({ projectId: 'p1', system: 'cctv', revision: 2, status: 'submitted', points: [{ code: 'C-01', activity: 'x' }] });
    await expect(svc.bindChecklist(rec.id, TENANT, otherProject.itpId, 'u-tc')).rejects.toThrow(/different project/);
    await expect(svc.bindChecklist(rec.id, TENANT, otherSystem.itpId, 'u-tc')).rejects.toThrow(/different system/);
    await expect(svc.bindChecklist(rec.id, TENANT, submitted.itpId, 'u-tc')).rejects.toThrow(/only the current approved ITP revision can be bound/);
    expect((await svc.get(rec.id, TENANT))?.itpId).toBeNull();
  });

  it('pins the binding — a record cannot be moved to another revision', async () => {
    const { svc, checklists, rec } = await systemWithTwoPoints();
    const r2 = checklists.approve({ projectId: 'p1', system: 'cctv', revision: 2, points: [{ code: 'PL-034', activity: 'Permanent link' }] });
    await expect(svc.bindChecklist(rec.id, TENANT, r2.itpId, 'u-tc')).rejects.toThrow(/immutable once bound/);
  });

  it('reads the record history back from the event store, retests marked (TC-09)', async () => {
    const { svc, rec, link, image } = await systemWithTwoPoints();
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'fail', remarks: 'Over length', testedBy: 'u-tc' });
    await svc.recordTestResult(rec.id, link.id, TENANT, { result: 'pass', actual: '71.2 m', testedBy: 'u-tc' });
    await svc.recordTestResult(rec.id, image.id, TENANT, { result: 'pass', testedBy: 'u-tc' });

    const history = await svc.readHistory(rec.id, TENANT);
    expect(history.readable).toBe(true);
    // Created FROM the revision: the history starts with what it was tested against.
    expect(history.events[0]).toMatchObject({ type: 'commissioning.checklist.bound', actorId: 'u-tc', payload: { revision: 1, atRegistration: true } });
    const runs = history.events.filter((e) => e.type === 'commissioning.test-run.recorded');
    expect(runs.map((e) => `${e.payload.pointNo}#${e.payload.runNo}:${e.payload.result}:${e.payload.isRetest}`))
      .toEqual(['PL-034#1:fail:false', 'PL-034#2:pass:true', 'IMG-01#1:pass:false']);
    expect(runs.every((e) => e.actorId === 'u-tc')).toBe(true);

    // The workspace names the point that passed only on retest.
    expect((await svc.readWorkspace(TENANT)).systems[0].retestedPoints).toEqual(['PL-034']);
  });

  it('says the history is unreadable rather than empty when the store cannot be read', async () => {
    const failing = { append: async () => {}, list: async () => { throw new Error('store down'); } };
    const svc = new CommissioningService(new InMemoryCommissioningStore() as never, failing as never);
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-H', title: 'H', system: 'cctv' });
    expect(await svc.readHistory(rec.id, TENANT)).toEqual({ readable: false, events: [] });
  });

  it('refuses to bind with Quality unreadable — an absent port never unblocks', async () => {
    const svc = new CommissioningService(new InMemoryCommissioningStore() as never, { append: async () => {} } as never);
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-X', title: 'X', system: 'cctv' });
    await expect(svc.bindChecklist(rec.id, TENANT, 'anything', 'u-tc')).rejects.toThrow(/is unavailable/);
  });
});
