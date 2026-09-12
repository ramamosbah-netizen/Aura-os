import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import type { ElvEquipmentPort, EngineeringReleasePort, QualityEvidencePort } from './ports';

/**
 * TC-GATE-3 — the seams to the domains T&C reads.
 *
 * Two properties are worth more than the rest and are asserted from several angles:
 *
 *   1. An UNBOUND port does not silently pass. This is the failure mode a wiring mistake produces,
 *      and it would declare systems ready for handover on evidence nobody supplied.
 *   2. T&C writes nothing in the domains it reads. The ITP link and the escalation note are T&C's
 *      own records ABOUT Quality's records — the tests here check the shape of what is stored.
 */
const TENANT = 't-gate3';

function service(ports: {
  elv?: ElvEquipmentPort;
  quality?: QualityEvidencePort;
  engineering?: EngineeringReleasePort;
} = {}) {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [], listByAggregate: async () => [] };
  const svc = new CommissioningService(
    store as never,
    eventStore as never,
    ports.elv as never,
    ports.quality as never,
    ports.engineering as never,
  );
  return { svc, events };
}

const elvPort = (devices: { tag: string; system: string; status: string; commissioningRecordId?: string | null }): ElvEquipmentPort => ({
  readProjectEquipment: async () => [{ id: 'd1', commissioningRecordId: null, ...devices }],
});

const qualityPort = (evidence: Parameters<QualityEvidencePort['readProjectQualityEvidence']> extends never ? never : {
  ncrs?: { id: string; ncrNumber: string; system: string | null; severity: string; status: string }[];
  itps?: { id: string; reference: string; title: string; discipline: string; status: string; points: { activity: string; pointType: string; acceptanceCriteria: string; result: string }[] }[];
}): QualityEvidencePort => ({
  readProjectQualityEvidence: async () => ({ ncrs: evidence.ncrs ?? [], itps: evidence.itps ?? [] }),
});

const engineeringPort = (drawings: { discipline: string; status: string }[]): EngineeringReleasePort => ({
  readProjectDrawingRelease: async () => drawings,
});

async function commissionedSystem(svc: CommissioningService) {
  const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV — Tower A', system: 'cctv' });
  const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });
  await svc.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Image on VMS' });
  await svc.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
  return { rec, point };
}

describe('TC-GATE-3 — an unbound port blocks rather than passes', () => {
  it('reports UNKNOWN for every unread domain, and refuses COMMISSIONING READY', async () => {
    const { svc } = service(); // nothing wired at all
    const { rec } = await commissionedSystem(svc);

    const view = await svc.readWorkspace(TENANT, 'p1');
    const system = view.systems.find((s) => s.record.id === rec.id)!;

    expect(system.commissioned, 'T&C can still sign off on its own evidence').toBe(true);
    expect(system.readiness.commissioningReady, 'but readiness must not pass on evidence nobody supplied').toBe(false);
    expect(system.readiness.blocking).toEqual(expect.arrayContaining(['equipment', 'installation', 'engineering', 'quality']));
    expect(view.totals.commissioningReady).toBe(0);
  });

  it('reports UNKNOWN rather than failing the request when a port throws', async () => {
    const exploding: QualityEvidencePort = { readProjectQualityEvidence: async () => { throw new Error('Quality is down'); } };
    const { svc } = service({
      elv: elvPort({ tag: 'CAM-001', system: 'cctv', status: 'installed' }),
      engineering: engineeringPort([{ discipline: 'cctv', status: 'approved' }]),
      quality: exploding,
    });
    const { rec } = await commissionedSystem(svc);

    const view = await svc.readWorkspace(TENANT, 'p1');
    const system = view.systems.find((s) => s.record.id === rec.id)!;
    const quality = system.readiness.gates.find((g) => g.id === 'quality')!;
    expect(quality.state).toBe('UNKNOWN');
    expect(quality.reason).toMatch(/could not be read/i);
    // The rest of the chain still answered — one domain's outage does not blind the others.
    expect(system.readiness.gates.find((g) => g.id === 'engineering')!.state).toBe('READY');
  });

  it('reaches COMMISSIONING READY once every domain answers', async () => {
    const { svc } = service({
      elv: elvPort({ tag: 'CAM-001', system: 'cctv', status: 'installed' }),
      quality: qualityPort({}),
      engineering: engineeringPort([{ discipline: 'cctv', status: 'approved' }]),
    });
    const { rec } = await commissionedSystem(svc);

    const view = await svc.readWorkspace(TENANT, 'p1');
    const system = view.systems.find((s) => s.record.id === rec.id)!;
    expect(system.readiness.commissioningReady).toBe(true);
    expect(system.readiness.blocking).toEqual([]);
    expect(view.totals.commissioningReady).toBe(1);
  });

  it('a project-wide non-conformance blocks a system that is otherwise ready', async () => {
    const { svc } = service({
      elv: elvPort({ tag: 'CAM-001', system: 'cctv', status: 'installed' }),
      quality: qualityPort({ ncrs: [{ id: 'n1', ncrNumber: 'NCR-020', system: null, severity: 'major', status: 'raised' }] }),
      engineering: engineeringPort([{ discipline: 'cctv', status: 'approved' }]),
    });
    await commissionedSystem(svc);

    const [system] = (await svc.readWorkspace(TENANT, 'p1')).systems;
    expect(system.readiness.commissioningReady).toBe(false);
    expect(system.readiness.gates.find((g) => g.id === 'quality')!.reason).toContain('NCR-020');
  });
});

describe('TC-GATE-3 — ITP linkage', () => {
  const itp = {
    id: 'itp-1',
    reference: 'ITP-CCTV-01',
    title: 'CCTV installation and test',
    discipline: 'security systems',
    status: 'active',
    points: [
      { activity: 'Cable test', pointType: 'hold', acceptanceCriteria: 'Fluke pass', result: 'passed' },
      { activity: 'Image verification', pointType: 'witness', acceptanceCriteria: 'Sharp at 4 m', result: 'pending' },
    ],
  };

  it('shows the linked requirements with Quality’s own result, and never writes them', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-02', title: 'CCTV', system: 'cctv' });
    await svc.linkItp(rec.id, TENANT, { itpId: itp.id });

    const [system] = (await svc.readWorkspace(TENANT, 'p1')).systems;
    expect(system.itpRequirements).toHaveLength(2);
    expect(system.itpRequirements.map((r) => r.result)).toEqual(['passed', 'pending']);
    expect(system.itpRequirements[0].reference).toBe('ITP-CCTV-01');
    // The pending point blocks the Quality gate — Quality's result, T&C's consequence.
    expect(system.readiness.gates.find((g) => g.id === 'quality')!.state).toBe('BLOCKED');
  });

  it('links a single point, and can nominate the test point that proves it', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-03', title: 'CCTV', system: 'cctv' });
    const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });

    await svc.linkItp(rec.id, TENANT, { itpId: itp.id, pointIndex: 1, testItemId: point.id });

    const [system] = (await svc.readWorkspace(TENANT, 'p1')).systems;
    expect(system.itpRequirements).toHaveLength(1);
    expect(system.itpRequirements[0]).toMatchObject({ pointIndex: 1, activity: 'Image verification', testPointNo: 'IMG-01' });
  });

  it('refuses a test point that belongs to another system', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const a = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-A', title: 'A', system: 'cctv' });
    const b = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-B', title: 'B', system: 'cctv' });
    const point = await svc.addTestItem(a.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });

    await expect(svc.linkItp(b.id, TENANT, { itpId: itp.id, pointIndex: 0, testItemId: point.id }))
      .rejects.toThrow(/not found: test point/i);
  });

  it('refuses to nominate a test point against a whole plan', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-04', title: 'CCTV', system: 'cctv' });
    const point = await svc.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });

    await expect(svc.linkItp(rec.id, TENANT, { itpId: itp.id, testItemId: point.id }))
      .rejects.toThrow(/specific ITP point/i);
  });

  it('refuses the same requirement twice rather than double-counting it', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-05', title: 'CCTV', system: 'cctv' });
    await svc.linkItp(rec.id, TENANT, { itpId: itp.id, pointIndex: 0 });
    await expect(svc.linkItp(rec.id, TENANT, { itpId: itp.id, pointIndex: 0 })).rejects.toThrow(/already linked/i);
  });

  it('unlinking removes T&C’s statement and nothing of Quality’s', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [itp] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-06', title: 'CCTV', system: 'cctv' });
    const link = await svc.linkItp(rec.id, TENANT, { itpId: itp.id });
    await svc.unlinkItp(rec.id, link.id, TENANT);

    expect(await svc.listItpLinks(rec.id, TENANT)).toHaveLength(0);
    const evidence = await svc.readQualityEvidence(TENANT, 'p1');
    expect(evidence?.itps[0].points, 'the plan is untouched').toHaveLength(2);
  });

  it('a link to a plan Quality no longer returns simply shows nothing, rather than a broken row', async () => {
    const { svc } = service({ quality: qualityPort({ itps: [] }) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-07', title: 'CCTV', system: 'cctv' });
    await svc.linkItp(rec.id, TENANT, { itpId: 'itp-gone' });
    const [system] = (await svc.readWorkspace(TENANT, 'p1')).systems;
    expect(system.itpRequirements).toEqual([]);
  });
});

describe('TC-GATE-3 — Quality escalation seam', () => {
  it('records the request and the NCR reference, and creates no NCR', async () => {
    const { svc } = service({ quality: qualityPort({}) });
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-08', title: 'CCTV', system: 'cctv' });
    const defect = await svc.addPunchItem(rec.id, TENANT, { description: 'Camera 3 out of focus', severity: 'major' });

    const escalated = await svc.escalatePunchItem(rec.id, defect.id, TENANT, { qualityNcrId: 'NCR-014', escalatedBy: 'u1' });
    expect(escalated.qualityNcrId).toBe('NCR-014');
    expect(escalated.escalationRequestedAt).not.toBeNull();
    expect(escalated.escalatedBy).toBe('u1');
    // Nothing was written into Quality: the port is read-only and the evidence is unchanged.
    expect((await svc.readQualityEvidence(TENANT, 'p1'))?.ncrs).toEqual([]);
  });

  it('can be requested before an NCR exists, then updated with the reference', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-09', title: 'CCTV', system: 'cctv' });
    const defect = await svc.addPunchItem(rec.id, TENANT, { description: 'Rack labelling', severity: 'minor' });

    const requested = await svc.escalatePunchItem(rec.id, defect.id, TENANT, {});
    expect(requested.escalationRequestedAt).not.toBeNull();
    expect(requested.qualityNcrId).toBeNull();

    const linked = await svc.escalatePunchItem(rec.id, defect.id, TENANT, { qualityNcrId: 'NCR-021' });
    expect(linked.qualityNcrId).toBe('NCR-021');
    expect(linked.escalationRequestedAt, 'the original request time is kept').toBe(requested.escalationRequestedAt);
  });

  it('refuses to escalate a defect that is already closed', async () => {
    const { svc } = service();
    const rec = await svc.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-10', title: 'CCTV', system: 'cctv' });
    const defect = await svc.addPunchItem(rec.id, TENANT, { description: 'Loose connector', severity: 'minor' });
    await svc.closePunchItem(rec.id, defect.id, TENANT, { resolution: 'Re-terminated' });

    await expect(svc.escalatePunchItem(rec.id, defect.id, TENANT, { qualityNcrId: 'NCR-030' }))
      .rejects.toThrow(/already closed/i);
  });
});
