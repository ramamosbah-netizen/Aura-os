import { describe, it, expect, beforeEach } from 'vitest';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import { EngineeringService } from './engineering.service';
import { InMemoryDrawingStore } from './in-memory-drawing-store';
import { InMemoryRfiStore } from './in-memory-rfi-store';
import { InMemorySubmittalStore } from './in-memory-submittal-store';
import { InMemoryTechnicalQueryStore } from './in-memory-technical-query-store';
import { InMemoryBimModelStore } from './in-memory-bim-model-store';
import { respondToQuery } from './domain/technical-query';
import { makeTechnicalQuery } from './domain/technical-query';
import { bumpModelVersion, makeBimModel } from './domain/bim-model';

// Service-level workflow coverage for the Engineering module (previously the
// thinnest-tested module): TQ lifecycle and BIM model registry/versioning.

const tenantId = 't1';
const mockEvents = { appendWithClient: async () => [] } as unknown as EventStore;
const mockTx: TxRunner = { run: (fn) => fn(null) };

function buildService(): EngineeringService {
  return new EngineeringService(
    new InMemoryDrawingStore(),
    new InMemoryRfiStore(),
    new InMemorySubmittalStore(),
    new InMemoryTechnicalQueryStore(),
    new InMemoryBimModelStore(),
    mockEvents,
    mockTx,
    new AccessService(),
  );
}

describe('Technical Queries (service workflow)', () => {
  let svc: EngineeringService;
  beforeEach(() => {
    svc = buildService();
  });

  it('raises a TQ with defaults and closes it on response', async () => {
    const tq = await svc.createTechnicalQuery({
      tenantId,
      projectId: 'p1',
      code: 'TQ-001',
      title: 'Cable tray routing clash',
      query: 'Tray clashes with duct at gridline 5 — reroute?',
      costImpact: true,
    });
    expect(tq.status).toBe('open');
    expect(tq.priority).toBe('medium');
    expect(tq.discipline).toBe('other');
    expect(tq.costImpact).toBe(true);
    expect(tq.response).toBeNull();

    const responded = await svc.respondTechnicalQuery(tenantId, null, tq.id, 'Reroute below duct, RFI-12 applies.');
    expect(responded.status).toBe('responded');
    expect(responded.response).toContain('Reroute below duct');
    expect(responded.respondedAt).not.toBeNull();
  });

  it('lists TQs by project filter', async () => {
    await svc.createTechnicalQuery({ tenantId, projectId: 'p1', code: 'TQ-1', title: 'A', query: 'q' });
    await svc.createTechnicalQuery({ tenantId, projectId: 'p2', code: 'TQ-2', title: 'B', query: 'q' });
    const forP1 = await svc.listTechnicalQueries({ tenantId, projectId: 'p1' });
    expect(forP1.map((t) => t.code)).toEqual(['TQ-1']);
  });

  it('rejects responding to a missing TQ', async () => {
    await expect(svc.respondTechnicalQuery(tenantId, null, 'nope', 'x')).rejects.toThrow(/not found/);
  });
});

describe('Technical Query domain', () => {
  it('trims inputs and preserves flags on respond', () => {
    const tq = makeTechnicalQuery({
      tenantId, projectId: 'p1',
      code: ' TQ-9 ', title: ' Spacing ', query: ' clarify ',
      priority: 'high', discipline: 'elv', timeImpact: true,
    });
    expect(tq.code).toBe('TQ-9');
    expect(tq.priority).toBe('high');

    const done = respondToQuery(tq, '  use 300mm  ');
    expect(done.response).toBe('use 300mm');
    expect(done.timeImpact).toBe(true);
    expect(done.status).toBe('responded');
  });
});

describe('BIM model registry (service workflow)', () => {
  let svc: EngineeringService;
  beforeEach(() => {
    svc = buildService();
  });

  it('registers a model with defaults and bumps versions', async () => {
    const model = await svc.registerBimModel({
      tenantId,
      projectId: 'p1',
      code: 'BIM-STR-01',
      name: 'Structural model',
      discipline: 'structural',
      storageKey: 'models/str-01-rA.ifc',
    });
    expect(model.version).toBe(1);
    expect(model.revision).toBe('A');
    expect(model.format).toBe('ifc');
    expect(model.status).toBe('wip');

    const v2 = await svc.newBimModelVersion(tenantId, model.id, {
      revision: 'B',
      storageKey: 'models/str-01-rB.ifc',
      status: 'shared',
    });
    expect(v2.version).toBe(2);
    expect(v2.revision).toBe('B');
    expect(v2.status).toBe('shared');
    expect(v2.storageKey).toBe('models/str-01-rB.ifc');
  });

  it('is tenant-scoped: another tenant cannot version the model', async () => {
    const model = await svc.registerBimModel({ tenantId, projectId: 'p1', code: 'M', name: 'M' });
    await expect(svc.newBimModelVersion('other-tenant', model.id, { revision: 'B' })).rejects.toThrow(/not found/);
  });
});

describe('BIM model domain', () => {
  it('bumpModelVersion keeps unpatched fields', () => {
    const m = makeBimModel({ tenantId, projectId: 'p1', code: 'M', name: 'Model', fileSizeBytes: 42 });
    const v2 = bumpModelVersion(m, { revision: 'B' });
    expect(v2.version).toBe(2);
    expect(v2.fileSizeBytes).toBe(42);
    expect(v2.storageKey).toBe(m.storageKey);
  });
});
