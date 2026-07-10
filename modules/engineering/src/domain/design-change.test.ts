import { describe, it, expect } from 'vitest';
import { AccessService, type EventStore, type TxRunner } from '@aura/core';
import { EngineeringService } from '../engineering.service';
import { InMemoryDrawingStore } from '../in-memory-drawing-store';
import { InMemoryRfiStore } from '../in-memory-rfi-store';
import { InMemorySubmittalStore } from '../in-memory-submittal-store';
import { InMemoryTechnicalQueryStore } from '../in-memory-technical-query-store';
import { InMemoryBimModelStore } from '../in-memory-bim-model-store';
import { InMemoryDesignChangeStore } from '../in-memory-design-change-store';
import { InMemoryEngineeringDocumentStore } from '../in-memory-engineering-document-store';
import { decideDesignChange, makeDesignChange, triggersVariation } from './design-change';

// Coverage for the design-change vertical (previously untested): the ADR-0011/0012
// composition seam where an APPROVED change WITH cost impact must announce
// `engineering.design_change.approved` with `triggersVariation: true` — the payload
// the cross-module reactor turns into a draft commercial Variation in Projects.

const mockTx: TxRunner = { run: (fn) => fn(null) };

function build(): { svc: EngineeringService; emitted: Array<{ type: string; payload: Record<string, unknown> }> } {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const events = {
    appendWithClient: async (_h: unknown, evts: Array<{ type: string; payload: Record<string, unknown> }>) => {
      emitted.push(...evts);
      return evts;
    },
  } as unknown as EventStore;
  // Real access seam: u-pm holds engineering.* at tenant t1 — the decide calls below
  // pass a real actor, so the permission assert is exercised, not bypassed.
  const access = new AccessService();
  access.registerRole({ id: 'engMgr', name: 'Engineering Manager', permissions: ['engineering.*'] });
  access.grant({ userId: 'u-pm', roleId: 'engMgr', scope: { kind: 'org', level: 'tenant', id: 't1' } });
  const svc = new EngineeringService(
    new InMemoryDrawingStore(),
    new InMemoryRfiStore(),
    new InMemorySubmittalStore(),
    new InMemoryTechnicalQueryStore(),
    new InMemoryBimModelStore(),
    new InMemoryDesignChangeStore(),
    new InMemoryEngineeringDocumentStore(),
    events,
    mockTx,
    access,
  );
  return { svc, emitted };
}

describe('Design change domain rules', () => {
  it('clamps a negative estimate to zero and defaults to a no-impact addition', () => {
    const dc = makeDesignChange({
      tenantId: 't1', projectId: 'p1', code: ' DC-01 ', title: ' Reroute risers ', estimatedValue: -500,
    });
    expect(dc.code).toBe('DC-01');
    expect(dc.changeType).toBe('addition');
    expect(dc.costImpact).toBe(false);
    expect(dc.estimatedValue).toBe(0);
    expect(dc.status).toBe('draft');
  });

  it('stamps the decider only on approve/reject, and triggersVariation needs all three conditions', () => {
    const dc = makeDesignChange({
      tenantId: 't1', projectId: 'p1', code: 'DC-02', title: 'Extra containment', costImpact: true, estimatedValue: 25000,
    });
    const submitted = decideDesignChange(dc, 'submitted', 'u-eng');
    expect(submitted.decidedBy).toBeNull(); // interim status decides nothing

    const approved = decideDesignChange(submitted, 'approved', 'u-pm');
    expect(approved.decidedBy).toBe('u-pm');
    expect(approved.decidedAt).not.toBeNull();
    expect(triggersVariation(approved)).toBe(true);

    // approved but no commercial impact → no variation
    expect(triggersVariation({ ...approved, costImpact: false })).toBe(false);
    expect(triggersVariation({ ...approved, estimatedValue: 0 })).toBe(false);
    expect(triggersVariation({ ...approved, status: 'rejected' })).toBe(false);
  });
});

describe('Design change service workflow (Variation composition seam)', () => {
  it('approval with cost impact emits ...approved with triggersVariation and the value snapshot', async () => {
    const { svc, emitted } = build();
    const dc = await svc.createDesignChange({
      tenantId: 't1', projectId: 'p1', projectName: 'Downtown Tower',
      code: 'DC-11', title: 'Client-added CCTV coverage, car park',
      changeType: 'addition', costImpact: true, estimatedValue: 48000,
    });
    expect(emitted.map((e) => e.type)).toContain('engineering.design_change.raised');

    await svc.decideDesignChange('t1', 'u-pm', dc.id, 'approved');
    const approved = emitted.find((e) => e.type === 'engineering.design_change.approved');
    expect(approved?.payload).toMatchObject({
      code: 'DC-11',
      status: 'approved',
      projectId: 'p1',
      changeType: 'addition',
      estimatedValue: 48000,
      triggersVariation: true, // the reactor's explicit go-signal
    });
  });

  it('rejection emits ...rejected with triggersVariation false — no Variation is spawned', async () => {
    const { svc, emitted } = build();
    const dc = await svc.createDesignChange({
      tenantId: 't1', projectId: 'p1', code: 'DC-12', title: 'VE: cheaper cable spec',
      changeType: 'omission', costImpact: true, estimatedValue: 12000,
    });
    await svc.decideDesignChange('t1', 'u-pm', dc.id, 'rejected');
    const rejected = emitted.find((e) => e.type === 'engineering.design_change.rejected');
    expect(rejected?.payload).toMatchObject({ code: 'DC-12', triggersVariation: false });
    await expect(svc.decideDesignChange('t1', null, 'ghost', 'approved')).rejects.toThrow(/not found/);
  });
});
