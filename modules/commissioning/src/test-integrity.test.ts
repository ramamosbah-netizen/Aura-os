import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';

/**
 * TC-GATE-1 — the two integrity defects, asserted end to end through the service.
 *
 * These are the behaviours a consultant, a client and a dispute rely on: a failure that stays
 * visible after it is corrected, and a sign-off that cannot be reached by typing over the evidence.
 * They are asserted here rather than only in the domain because both defects lived in the seam
 * BETWEEN the domain and the store — the domain functions were individually reasonable.
 */
const TENANT = 't-gate1';

function service(): { svc: CommissioningService; events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = {
    append: async (batch: DomainEvent[]) => { events.push(...batch); },
    list: async () => [],
    listByAggregate: async () => [],
  };
  // The service takes the two collaborators by DI symbol; constructing directly keeps the test on
  // the real code path without a Nest container.
  const svc = new CommissioningService(store as never, eventStore as never);
  return { svc, events };
}

async function systemWithTwoPoints() {
  const { svc, events } = service();
  const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV — Tower A' });
  const link = await svc.addTestItem(rec.id, TENANT, { pointNo: 'PL-034', description: 'Permanent link', expected: '≤ 90 m' });
  const image = await svc.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image', expected: 'Image on VMS' });
  return { svc, events, rec, link, image };
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
      .rejects.toThrow(/still failing \(PL-034\)/);

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
      .rejects.toThrow(/never executed \(IMG-01\)/);
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
    await expect(svc.commission(rec.id, TENANT, { commissionedBy: 'E', witnessedBy: 'C' })).rejects.toThrow(/open punch items/i);
  });
});
