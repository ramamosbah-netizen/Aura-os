import { describe, it, expect, beforeEach } from 'vitest';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import {
  QualityService,
  InMemoryNcrStore,
  InMemoryInspectionRequestStore,
  InMemorySnagStore,
  InMemoryItpStore,
  InMemoryMaterialApprovalStore,
  InMemoryCalibrationStore,
  InMemoryAuditScheduleStore,
} from '@aura/quality';
import { WbsService } from './wbs.service';
import { InMemoryWbsStore } from './in-memory-wbs-store';

/**
 * ITP release gate — a WBS work package cannot be marked complete while the
 * project has active ITPs with pending inspection points. Wires the REAL
 * QualityService in as the gate (as ProjectsModule does via ITP_GATE).
 */
const tenantId = 't1';
const projectId = 'proj-1';

const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };
const access = new AccessService();

function buildQuality(): QualityService {
  return new QualityService(
    new InMemoryNcrStore(),
    new InMemoryInspectionRequestStore(),
    new InMemorySnagStore(),
    new InMemoryItpStore(),
    new InMemoryMaterialApprovalStore(),
    new InMemoryCalibrationStore(),
    new InMemoryAuditScheduleStore(),
    mockEvents,
    mockTx,
    access,
  );
}

describe('WBS completion — ITP release gate', () => {
  let quality: QualityService;
  let wbs: WbsService;

  beforeEach(() => {
    quality = buildQuality();
    wbs = new WbsService(new InMemoryWbsStore(), mockEvents, access, quality);
  });

  async function makeNode() {
    return wbs.create({ tenantId, projectId, code: '1.1', title: 'Substructure', plannedValue: 1000 });
  }

  async function makeActiveItp() {
    const itp = await quality.createItp({
      tenantId,
      projectId,
      reference: 'ITP-CIV-001',
      title: 'Concrete works',
      points: [{ activity: 'Rebar inspection', pointType: 'hold' }],
    });
    return quality.activateItp(tenantId, itp.id);
  }

  it('blocks completion while an active ITP has pending points', async () => {
    const node = await makeNode();
    await makeActiveItp();

    await expect(wbs.updateProgress(node.id, 100)).rejects.toThrow(/ITP gate blocked.*ITP-CIV-001/);

    // Partial progress is still allowed — only completion is gated.
    const updated = await wbs.updateProgress(node.id, 60);
    expect(updated.progress).toBe(60);
    expect(updated.status).toBe('in_progress');
  });

  it('releases completion once all inspection points are resolved', async () => {
    const node = await makeNode();
    const itp = await makeActiveItp();

    await quality.recordItpPoint(tenantId, itp.id, 0, 'passed');
    const done = await wbs.updateProgress(node.id, 100);
    expect(done.status).toBe('completed');
    expect(done.earnedValue).toBe(1000);
  });

  it('ignores draft ITPs and other projects', async () => {
    const node = await makeNode();
    // Draft ITP on the same project (not yet in force) …
    await quality.createItp({
      tenantId, projectId,
      reference: 'ITP-DRAFT', title: 'Later package',
      points: [{ activity: 'X', pointType: 'review' }],
    });
    // … and an active ITP on a DIFFERENT project.
    const other = await quality.createItp({
      tenantId, projectId: 'proj-other',
      reference: 'ITP-OTHER', title: 'Other job',
      points: [{ activity: 'Y', pointType: 'hold' }],
    });
    await quality.activateItp(tenantId, other.id);

    const done = await wbs.updateProgress(node.id, 100);
    expect(done.status).toBe('completed');
  });

  it('completes without a gate when the Quality module is absent', async () => {
    const ungated = new WbsService(new InMemoryWbsStore(), mockEvents, access);
    const node = await ungated.create({ tenantId, projectId, code: '1', title: 'Root', plannedValue: 10 });
    const done = await ungated.updateProgress(node.id, 100);
    expect(done.status).toBe('completed');
  });
});
