import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@aura/shared';
import { CommissioningService } from './commissioning.service';
import { HandoverService } from './handover.service';
import { InMemoryCommissioningStore } from './in-memory-commissioning-store';
import { assessHandoverReadiness, type HandoverReadinessFacts } from './domain/handover-readiness';
import type { ElvEquipmentPort, EngineeringReleasePort, QualityEvidencePort } from './ports';

/**
 * TC-GATE-4 — handover readiness as a projection.
 *
 * The behaviour being removed is specific: a package could read "test certificates ✓" while its
 * systems had never been tested, because the tick and the evidence lived in different places. So the
 * tests that matter most are the ones that try to tick past the evidence and fail.
 */
const TENANT = 't-gate4';

const facts = (over: Partial<HandoverReadinessFacts> = {}): HandoverReadinessFacts => ({
  systemsTotal: 1,
  systemsCommissioningReady: 1,
  notReadyReasons: [],
  drawings: [{ discipline: 'cctv', status: 'as_built' }],
  asserted: { omManuals: true, warrantyDocs: true, training: true, spares: true },
  ...over,
});

const itemOf = (over: Partial<HandoverReadinessFacts>, id: string) =>
  assessHandoverReadiness(facts(over)).items.find((i) => i.id === id)!;

describe('TC-GATE-4 — the readiness projection', () => {
  it('is ready only when every item is', () => {
    const r = assessHandoverReadiness(facts());
    expect(r.readyToSubmit).toBe(true);
    expect(r.blocking).toEqual([]);
    expect(r.items.map((i) => i.id)).toEqual(['commissioning', 'asBuilts', 'omManuals', 'warrantyDocs', 'training', 'spares']);
  });

  it('marks which items are evidence and which are somebody’s word', () => {
    const byId = new Map(assessHandoverReadiness(facts()).items.map((i) => [i.id, i]));
    expect(byId.get('commissioning')!.evidence).toBe('projected');
    expect(byId.get('asBuilts')!.evidence).toBe('projected');
    expect(byId.get('omManuals')!.evidence).toBe('asserted');
    expect(byId.get('training')!.evidence).toBe('asserted');
    // An assertion says so in its own reason, so nobody mistakes it for a check.
    expect(byId.get('omManuals')!.reason).toMatch(/nothing verifies this/i);
  });

  it('blocks while any system is not commissioning ready, and carries T&C’s own reason', () => {
    const item = itemOf({ systemsTotal: 2, systemsCommissioningReady: 1, notReadyReasons: ['TC-ACS-02: 1 linked ITP point not passed.'] }, 'commissioning');
    expect(item.state).toBe('BLOCKED');
    expect(item.reason).toContain('1 of 2');
    expect(item.reason).toContain('TC-ACS-02');
  });

  it('a project with nothing registered is UNKNOWN, not ready', () => {
    const item = itemOf({ systemsTotal: 0, systemsCommissioningReady: 0 }, 'commissioning');
    expect(item.state).toBe('UNKNOWN');
    expect(assessHandoverReadiness(facts({ systemsTotal: 0, systemsCommissioningReady: 0 })).readyToSubmit).toBe(false);
  });

  it('as-builts are UNKNOWN when Engineering cannot be read, and BLOCKED when none are released', () => {
    expect(itemOf({ drawings: null }, 'asBuilts').state).toBe('UNKNOWN');
    expect(itemOf({ drawings: [] }, 'asBuilts').state).toBe('UNKNOWN');
    const blocked = itemOf({ drawings: [{ discipline: 'cctv', status: 'approved' }] }, 'asBuilts');
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.reason).toMatch(/none marked as-built/i);
  });

  it('an unticked assertion blocks and explains why it cannot be derived', () => {
    const item = itemOf({ asserted: { omManuals: false, warrantyDocs: true, training: true, spares: true } }, 'omManuals');
    expect(item.state).toBe('BLOCKED');
    expect(item.reason).toMatch(/no O&M package authority exists yet/i);
  });
});

// ── through the service, where the projection meets the real T&C calculation ────────────────────

function services(ports: { elv?: ElvEquipmentPort; quality?: QualityEvidencePort; engineering?: EngineeringReleasePort } = {}) {
  const events: DomainEvent[] = [];
  const store = new InMemoryCommissioningStore();
  const eventStore = { append: async (b: DomainEvent[]) => { events.push(...b); }, list: async () => [], listByAggregate: async () => [] };
  const commissioning = new CommissioningService(store as never, eventStore as never, ports.elv as never, ports.quality as never, ports.engineering as never);
  const handover = new HandoverService(store as never, eventStore as never, commissioning, ports.engineering as never);
  return { commissioning, handover, events };
}

const readyPorts = {
  elv: { readProjectEquipment: async () => [{ id: 'd1', tag: 'CAM-001', system: 'cctv', status: 'installed', commissioningRecordId: null }] } as ElvEquipmentPort,
  quality: { readProjectQualityEvidence: async () => ({ ncrs: [], itps: [] }) } as QualityEvidencePort,
  engineering: { readProjectDrawingRelease: async () => [{ discipline: 'cctv', status: 'as_built' }] } as EngineeringReleasePort,
};

async function commissionedProject(commissioning: CommissioningService) {
  const rec = await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-01', title: 'CCTV', system: 'cctv' });
  const point = await commissioning.addTestItem(rec.id, TENANT, { pointNo: 'IMG-01', description: 'Camera image' });
  await commissioning.recordTestResult(rec.id, point.id, TENANT, { result: 'pass', actual: 'Image on VMS' });
  await commissioning.commission(rec.id, TENANT, { commissionedBy: 'Engineer', witnessedBy: 'Consultant' });
  return rec;
}

describe('TC-GATE-4 — a tick can no longer buy a submission', () => {
  it('refuses to tick the two derived items', async () => {
    const { handover } = services(readyPorts);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-01', title: 'Tower A handover' });

    await expect(handover.updateChecklist(pkg.id, TENANT, { testCertificates: true }))
      .rejects.toThrow(/only an item without an owning authority can be ticked/i);
    await expect(handover.updateChecklist(pkg.id, TENANT, { asBuilts: true }))
      .rejects.toThrow(/derived from Testing & Commissioning and Engineering/i);
  });

  it('refuses the submission while a system is not commissioning ready, whatever is ticked', async () => {
    const { commissioning, handover } = services(readyPorts);
    // Registered, never tested — T&C's chain blocks, so handover must too.
    await commissioning.register({ tenantId: TENANT, projectId: 'p1', code: 'TC-CCTV-02', title: 'CCTV', system: 'cctv' });
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-02', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { omManuals: true, warrantyDocs: true, training: true, spares: true });

    await expect(handover.submit(pkg.id, TENANT)).rejects.toThrow(/not commissioning ready/i);
  });

  it('submits once the evidence supports it', async () => {
    const { commissioning, handover } = services(readyPorts);
    await commissionedProject(commissioning);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-03', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { omManuals: true, warrantyDocs: true, training: true, spares: true });

    const view = await handover.get(pkg.id, TENANT);
    expect(view!.readiness.readyToSubmit).toBe(true);
    expect(view!.readiness.items.find((i) => i.id === 'commissioning')!.reason).toMatch(/pass the full commissioning readiness chain/i);

    const submitted = await handover.submit(pkg.id, TENANT);
    expect(submitted.status).toBe('submitted');
  });

  it('blocks when Engineering is unwired, even with everything else in place', async () => {
    const { commissioning, handover } = services({ elv: readyPorts.elv, quality: readyPorts.quality });
    await commissionedProject(commissioning);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-04', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { omManuals: true, warrantyDocs: true, training: true, spares: true });

    const view = await handover.get(pkg.id, TENANT);
    expect(view!.readiness.items.find((i) => i.id === 'asBuilts')!.state).toBe('UNKNOWN');
    await expect(handover.submit(pkg.id, TENANT)).rejects.toThrow(/handover evidence is complete/i);
  });

  it('leaves acceptance and the warranty clock exactly as they were', async () => {
    const { commissioning, handover, events } = services(readyPorts);
    await commissionedProject(commissioning);
    const pkg = await handover.create({ tenantId: TENANT, projectId: 'p1', code: 'HO-05', title: 'Tower A handover' });
    await handover.updateChecklist(pkg.id, TENANT, { omManuals: true, warrantyDocs: true, training: true, spares: true });
    await handover.submit(pkg.id, TENANT);

    const accepted = await handover.accept(pkg.id, TENANT, { clientRepresentative: 'Client Rep', warrantyMonths: 24 });
    expect(accepted.status).toBe('accepted');
    expect(accepted.warrantyStartDate).toBeTruthy();
    expect(accepted.warrantyMonths).toBe(24);
    // The deliver → maintain event is untouched: AMC still keys off this.
    const emitted = events.filter((e) => e.type === 'commissioning.handover.accepted');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload).toMatchObject({ warrantyMonths: 24, clientRepresentative: 'Client Rep' });
  });
});
