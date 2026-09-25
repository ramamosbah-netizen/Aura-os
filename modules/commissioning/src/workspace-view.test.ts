import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { ApprovedChecklistFixture } from './approved-checklist.fixture';

/**
 * TC-GATE-2 — the workspace read model.
 *
 * Everything the four T&C surfaces show is derived here, so this is where "the screen said eligible
 * and the backend refused" would show up. The eligibility cases assert exactly that pairing:
 * eligibility as reported, and the sign-off attempt that must agree with it.
 */
const TENANT = 't-gate2';

function service() {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [], listByAggregate: async () => [] };
  const checklists = new ApprovedChecklistFixture();
  const svc = new CommissioningService(store as never, eventStore as never, undefined, undefined, undefined, undefined, checklists);
  /** A CCTV record created from an approved revision carrying exactly these points. */
  const boundSystem = async (code: string, points: string[]) => {
    const itp = checklists.approve({ projectId: 'p1', system: 'cctv', points: points.map((c) => ({ code: c, activity: `Point ${c}` })) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code, title: 'CCTV', system: 'cctv', itpId: itp.itpId, createdBy: 'u-tc' });
    const items = await svc.listTestItems(rec.id, TENANT);
    return { rec, point: (c: string) => items.find((i) => i.pointNo === c)! };
  };
  return { svc, events, boundSystem };
}

describe('TC-GATE-2 — workspace projection', () => {
  it('names the blocker for a system with nothing to prove yet', async () => {
    const { svc } = service();
    await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-01', title: 'CCTV' });

    const view = await svc.readWorkspace(TENANT);
    expect(view.totals).toMatchObject({ inScope: 1, noTestPoints: 1, eligible: 0, commissioned: 0 });
    expect(view.systems[0].blockers).toEqual(['No approved checklist — bind this system to the approved ITP revision for its system']);
    expect(view.systems[0].checklist).toBeNull();
    expect(view.systems[0].eligible, 'a system with no evidence is not eligible').toBe(false);
  });

  it('counts a point that has never been executed separately from one that failed', async () => {
    const { svc, boundSystem } = service();
    const { rec, point } = await boundSystem('TC-02', ['PL-001', 'PL-002']);
    await svc.recordTestResult(rec.id, point('PL-001').id, TENANT, { result: 'fail', remarks: 'Over length' });

    const view = await svc.readWorkspace(TENANT, 'p1');
    const s = view.systems[0];
    expect(s).toMatchObject({ pointsTotal: 2, pointsFailing: 1, pointsUntested: 1, retestsRequired: 1 });
    expect(s.checklist).toMatchObject({ revision: 1, reference: 'ITP-CCTV', boundBy: 'u-tc' });
    expect(s.blockers).toEqual([
      '1 test point failing — retest required (PL-001)',
      '1 mandatory point of the approved revision never executed (PL-002)',
    ]);
  });

  it('carries the failing run as evidence, not just a count', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-03', title: 'Cabling' });
    const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'PL-034', description: 'Permanent link', expected: 'max 90 m' });
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', actual: '104.8 m', remarks: 'Over length' });

    const [failing] = (await svc.readWorkspace(TENANT)).systems[0].failingPoints;
    expect(failing).toMatchObject({ pointNo: 'PL-034', lastRunNo: 1, lastActual: '104.8 m', runCount: 1, openPunchIds: [] });
    expect(failing.lastRemarks).toMatch(/over length/i);
  });

  it('a point failing on its third run reports the whole loop, not just the last lap', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-04', title: 'Cabling' });
    const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'PL-034', description: 'Permanent link' });
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', remarks: 'First' });
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'pass' });
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', remarks: 'Regressed' });

    const s = (await svc.readWorkspace(TENANT)).systems[0];
    expect(s.failingPoints[0]).toMatchObject({ lastRunNo: 3, runCount: 3 });
    expect(s.pointsEverFailed).toBe(1);
  });

  it('reports eligible exactly when the sign-off guard would allow it', async () => {
    const { svc, boundSystem } = service();
    const { rec, point: p } = await boundSystem('TC-05', ['IMG-01']);
    const point = p('IMG-01');

    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', remarks: 'No image' });
    expect((await svc.readWorkspace(TENANT)).systems[0].eligible).toBe(false);
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).rejects.toThrow();

    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Image on VMS' });
    expect((await svc.readWorkspace(TENANT)).systems[0].eligible).toBe(true);
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).resolves.toMatchObject({ status: 'commissioned' });

    const after = (await svc.readWorkspace(TENANT)).systems[0];
    expect(after).toMatchObject({ commissioned: true, eligible: false });
    expect(after.blockers, 'a commissioned system is not blocked').toEqual([]);
  });

  it('an open defect makes a fully-passed system ineligible, and the guard agrees', async () => {
    const { svc, boundSystem } = service();
    const { rec, point } = await boundSystem('TC-06', ['IMG-01']);
    await svc.recordTestResult(rec.id, point('IMG-01').id, TENANT, { result: 'pass' });
    await svc.addPunchItem(rec.id, TENANT, { description: 'Camera 3 out of focus', severity: 'major' });

    const s = (await svc.readWorkspace(TENANT)).systems[0];
    expect(s).toMatchObject({ eligible: false, openPunch: 1 });
    expect(s.blockers).toEqual(['1 open defect']);
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).rejects.toThrow(/1 open defect/i);
  });

  it('scopes to one project', async () => {
    const { svc } = service();
    await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-07', title: 'A' });
    await svc.register({ tenantId: TENANT, projectId: 'p2', code: 'TC-08', title: 'B' });
    expect((await svc.readWorkspace(TENANT)).totals.inScope).toBe(2);
    expect((await svc.readWorkspace(TENANT, 'p1')).totals.inScope).toBe(1);
  });
});

describe('TC-GATE-2 — defect provenance', () => {
  it('links a defect to the failing point that raised it', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-09', title: 'Cabling' });
    const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'PL-034', description: 'Permanent link' });
    const run = await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', remarks: 'Over length' });
    expect(run.result).toBe('fail');

    const defect = await svc.addPunchItem(rec.id, TENANT, { description: 'PL-034 over length', severity: 'major', testItemId: point.id });
    expect(defect.testItemId).toBe(point.id);

    // The Defects surface can now show ONE problem rather than a failure and an unrelated defect.
    const failing = (await svc.readWorkspace(TENANT)).systems[0].failingPoints[0];
    expect(failing.openPunchIds).toEqual([defect.id]);
  });

  it('refuses a defect pointing at another system evidence', async () => {
    const { svc } = service();
    const a = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-10', title: 'A' });
    const b = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-11', title: 'B' });
    const point = await svc.addTestItem(a.id, TENANT, { pointNo: 'PL-001', description: 'Link' });

    await expect(svc.addPunchItem(b.id, TENANT, { description: 'wrong system', testItemId: point.id }))
      .rejects.toThrow(/not found: test point/i);
  });

  it('keeps a defect raised outside testing, with no evidence to point at', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-12', title: 'CCTV' });
    const defect = await svc.addPunchItem(rec.id, TENANT, { description: 'Rack label missing', severity: 'minor' });
    expect(defect).toMatchObject({ testItemId: null, sourceRunId: null, status: 'open' });
    expect((await svc.listProjectPunchItems(TENANT, 'p1')).map((p) => p.id)).toEqual([defect.id]);
  });
});
