import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { ApprovedChecklistFixture } from './approved-checklist.fixture';
import type { WorkReceiptPort } from './ports';

/**
 * TC-08 — CORRECTIVE ACTION, the owner's decision of 2026-09-25.
 *
 * A defect that needs a design correction is ROUTED by T&C to a named Design / Technical Engineer,
 * who receives it in My Work and RECORDS the corrective action. Only T&C closes it, and only after
 * the retest passes. PostgreSQL holds the same rules (migration 0389).
 */
const TENANT = 't-tc08';
const MEMBERS = new Set(['u-eng', 'u-eng-2']);

function service(receipts: WorkReceiptPort | undefined = undefined) {
  const events: DomainEvent[] = [];
  const raised: Array<{ assigneeId: string; title: string }> = [];
  const port: WorkReceiptPort = receipts ?? {
    canReceive: (_t, _p, userId) => MEMBERS.has(userId),
    raise: async (input) => { raised.push({ assigneeId: input.assigneeId, title: input.title }); return { id: `resp-${raised.length}` }; },
  };
  const checklists = new ApprovedChecklistFixture();
  const svc = new CommissioningService(
    new InMemoryCommissioningStore() as never,
    { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [] } as never,
    undefined, undefined, undefined, undefined, checklists, port,
  );
  return { svc, events, raised, checklists };
}

/** A bound CCTV system whose one point failed, with the defect raised from it. */
async function failedSystem() {
  const h = service();
  const itp = h.checklists.approve({ projectId: 'p1', system: 'cctv', points: [{ code: 'IMG-01', activity: 'Camera image' }] });
  const rec = await h.svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CX-01', title: 'CCTV', system: 'cctv', itpId: itp.itpId, createdBy: 'u-tc' });
  const [point] = await h.svc.listTestItems(rec.id, TENANT);
  await h.svc.recordTestResult(rec.id, point.id, TENANT, { result: 'fail', remarks: 'Image drops at night', testedBy: 'u-tc' });
  const defect = await h.svc.addPunchItem(rec.id, TENANT, { description: 'IR illuminators under-specified', severity: 'major', testItemId: point.id });
  return { ...h, rec, point, defect };
}

describe('TC-08 — routing a defect to Engineering', () => {
  it('routes to a named engineer, who receives it in My Work', async () => {
    const { svc, events, raised, rec, defect } = await failedSystem();
    const routed = await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Night-time illumination needs a design change' }, 'u-tc');
    expect(routed).toMatchObject({ routedTo: 'u-eng', routedBy: 'u-tc', routingReason: 'Night-time illumination needs a design change', routingReceiptId: 'resp-1' });
    expect(raised).toEqual([{ assigneeId: 'u-eng', title: 'Design correction: TC-CX-01 — IR illuminators under-specified' }]);
    expect(events.find((e) => e.type === 'commissioning.defect.routed')?.payload).toMatchObject({ routedTo: 'u-eng', receiptId: 'resp-1' });
  });

  it('refuses a person who cannot receive work on the project, and writes nothing', async () => {
    const { svc, raised, rec, defect } = await failedSystem();
    await expect(svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-stranger', reason: 'x' }, 'u-tc')).rejects.toThrow(/must be a member of this project/);
    expect(raised).toEqual([]);
    expect((await svc.listPunchItems(rec.id, TENANT))[0].routedTo).toBeNull();
  });

  it('refuses to route with nobody to tell — an absent receipt never routes silently', async () => {
    const svcNoPort = new CommissioningService(new InMemoryCommissioningStore() as never, { append: async () => {}, list: async () => [] } as never);
    const rec = await svcNoPort.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-X', title: 'X', system: 'cctv' });
    const defect = await svcNoPort.addPunchItem(rec.id, TENANT, { description: 'x' });
    await expect(svcNoPort.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'r' }, 'u-tc')).rejects.toThrow(/receipt is unavailable/);
  });

  it('is immutable once made, and needs a reason', async () => {
    const { svc, rec, defect } = await failedSystem();
    await expect(svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: '  ' }, 'u-tc')).rejects.toThrow(/requires a reason/);
    await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Design change' }, 'u-tc');
    await expect(svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng-2', reason: 'Other engineer' }, 'u-tc')).rejects.toThrow(/immutable once made/);
  });
});

describe('TC-08 — the corrective action, and who closes', () => {
  it('only the engineer it was routed to records the correction', async () => {
    const { svc, rec, defect } = await failedSystem();
    await expect(svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'x' }, 'u-eng')).rejects.toThrow(/only a defect routed to Engineering can take/);
    await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Design change' }, 'u-tc');
    await expect(svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'x' }, 'u-eng-2')).rejects.toThrow(/access denied: this defect was routed to u-eng/);
    await expect(svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'x' }, 'u-tc')).rejects.toThrow(/access denied/);
    const corrected = await svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'IR illuminators upgraded to 50 m', reference: 'DWG-CCTV-004 rev C' }, 'u-eng');
    expect(corrected).toMatchObject({ correctiveAction: 'IR illuminators upgraded to 50 m', correctionReference: 'DWG-CCTV-004 rev C', correctedBy: 'u-eng', status: 'open' });
  });

  it('a routed defect closes only once corrected AND retested — the retest is what proves it', async () => {
    const { svc, rec, point, defect } = await failedSystem();
    await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Design change' }, 'u-tc');
    const close = () => svc.closePunchItem(rec.id, defect.id, TENANT, { resolution: 'Upgraded and retested', closedBy: 'u-tc' });
    await expect(close()).rejects.toThrow(/only be closed once its corrective action is recorded/);
    await svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'IR illuminators upgraded' }, 'u-eng');
    await expect(close()).rejects.toThrow(/only be closed once the retest of its test point has passed/);
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Clear image at 40 m', testedBy: 'u-tc' });
    expect((await close()).status).toBe('closed');
    // …and the failure it answered is still on the record.
    expect((await svc.listTestRuns(rec.id, TENANT)).map((r) => r.result)).toEqual(['fail', 'pass']);
  });

  it('leaves a defect T&C resolves itself exactly as before', async () => {
    const { svc, rec, defect } = await failedSystem();
    expect((await svc.closePunchItem(rec.id, defect.id, TENANT, { resolution: 'Cleaned lens', closedBy: 'u-tc' })).status).toBe('closed');
  });

  it('the register joins each defect to its evidence, routing, correction, retest and closure', async () => {
    const { svc, rec, point, defect } = await failedSystem();
    await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Design change' }, 'u-tc');
    await svc.recordCorrection(rec.id, defect.id, TENANT, { action: 'IR upgraded', reference: 'DWG-004 rev C' }, 'u-eng');
    await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Clear at 40 m', testedBy: 'u-tc' });
    await svc.closePunchItem(rec.id, defect.id, TENANT, { resolution: 'Upgraded and retested', closedBy: 'u-tc' });
    const register = await svc.readDefectRegister(TENANT, 'p1');
    expect(register.defects).toHaveLength(1);
    expect(register.defects[0]).toMatchObject({
      systemCode: 'TC-CX-01', status: 'closed',
      point: { pointNo: 'IMG-01', latestResult: 'pass', runs: 2 },
      failingRun: { runNo: 1, remarks: 'Image drops at night' },
      routing: { to: 'u-eng', by: 'u-tc', reason: 'Design change' },
      correction: { action: 'IR upgraded', reference: 'DWG-004 rev C', by: 'u-eng' },
      closure: { by: 'u-tc', resolution: 'Upgraded and retested' },
      escalated: false,
    });
  });

  it("the engineer's queue holds only the defects routed to them", async () => {
    const { svc, rec, defect } = await failedSystem();
    const other = await svc.addPunchItem(rec.id, TENANT, { description: 'Rack label missing' });
    await svc.routeDefect(rec.id, defect.id, TENANT, { assigneeId: 'u-eng', reason: 'Design change' }, 'u-tc');
    await svc.routeDefect(rec.id, other.id, TENANT, { assigneeId: 'u-eng-2', reason: 'Labelling standard' }, 'u-tc');
    const queue = await svc.listEngineeringCorrections(TENANT, 'p1', 'u-eng');
    expect(queue.map((q) => q.id)).toEqual([defect.id]);
    expect(queue[0]).toMatchObject({ systemCode: 'TC-CX-01', point: { pointNo: 'IMG-01', result: 'fail' } });
    expect(await svc.listEngineeringCorrections(TENANT, 'p1', null)).toEqual([]);
  });
});
