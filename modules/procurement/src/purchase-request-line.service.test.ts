import { describe, it, expect, beforeEach } from 'vitest';
import type { TenantContext } from '@aura/core';
import {
  type MaterialCatalogue,
  type MaterialCitation,
  type ProjectCoding,
  PurchaseRequestLineService,
} from './purchase-request-line.service';
import { InMemoryPurchaseRequestLineStore } from './in-memory-purchase-request-line-store';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { makePurchaseRequest } from './domain/purchase-request';

/**
 * A stand-in catalogue with the same contract Inventory's material service satisfies: it answers
 * with identity AND description together, and refuses anything it cannot resolve or that may not
 * be named on new demand. Procurement never imports Inventory (ADR-0004), so the cross-module
 * binding itself is proved at the API level; what is proved here is what Procurement does with the
 * answer.
 */
class FakeCatalogue implements MaterialCatalogue {
  readonly materials = new Map<string, MaterialCitation & { obsolete?: boolean }>();

  add(code: string, over: Partial<MaterialCitation> & { obsolete?: boolean } = {}) {
    this.materials.set(code.toLowerCase(), {
      materialId: `mat-${code}`,
      materialCode: code,
      materialName: `${code} material`,
      specification: 'as authored',
      manufacturer: 'Hikvision',
      model: 'DS-1',
      uom: 'nr',
      ...over,
    });
    return this;
  }

  async citeMaterial(reference: string, _tenantId: string): Promise<MaterialCitation> {
    const m = this.materials.get(reference.trim().toLowerCase());
    if (!m) throw new Error(`no material matches "${reference}" — a requisition must name one from the catalogue`);
    if (m.obsolete) throw new Error(`material ${m.materialCode} is obsolete and is not active for new demand`);
    const { obsolete: _o, ...citation } = m;
    return citation;
  }
}

class FakeCoding implements ProjectCoding {
  /** `${kind}:${nodeId}` → the project it belongs to. */
  readonly nodes = new Map<string, string>();
  async nodeBelongsToProject(_t: string, projectId: string, nodeId: string, kind: 'wbs' | 'cbs') {
    return this.nodes.get(`${kind}:${nodeId}`) === projectId;
  }
}

const tenant = {
  get: () => ({ tenantId: 't1', companyId: null, actorId: 'u-buyer', correlationId: 'test' }),
  boundTenantId: () => 't1',
} as unknown as TenantContext;

async function harness(opts: { coding?: ProjectCoding | null; projectId?: string | null } = {}) {
  const lines = new InMemoryPurchaseRequestLineStore();
  const requests = new InMemoryPurchaseRequestStore();
  const catalogue = new FakeCatalogue().add('CAM-DOME-4MP').add('CBL-CAT6', { uom: 'm' });
  const coding = opts.coding === undefined ? new FakeCoding() : opts.coding;
  const pr = makePurchaseRequest({
    tenantId: 't1',
    title: 'Level 3 containment materials',
    projectId: opts.projectId === undefined ? 'proj-1' : opts.projectId,
    value: 0,
    createdBy: 'u-buyer',
  });
  await requests.create(pr);
  const svc = new PurchaseRequestLineService(lines, requests, catalogue, coding, tenant);
  return { svc, pr, requests, lines, catalogue, coding: coding as FakeCoding };
}

describe('a requisition line must name a material from the catalogue', () => {
  it('resolves by code and copies the whole description from the master', async () => {
    const { svc, pr } = await harness();
    const line = await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    expect(line).toMatchObject({
      materialId: 'mat-CAM-DOME-4MP',
      materialCode: 'CAM-DOME-4MP',
      materialName: 'CAM-DOME-4MP material',
      specification: 'as authored',
      manufacturer: 'Hikvision',
      model: 'DS-1',
      uom: 'nr',
      quantity: 10,
      lineNo: 1,
    });
  });

  it('takes the unit from the material, so a requisition cannot invent one', async () => {
    const { svc, pr } = await harness();
    // There is no way to pass a unit in — the only source is the resolved material.
    expect((await svc.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 250 })).uom).toBe('m');
  });

  it('refuses a material nobody can resolve, and writes nothing', async () => {
    const { svc, pr } = await harness();
    await expect(svc.addLine({ prId: pr.id, material: 'MADE-UP', quantity: 1 }))
      .rejects.toThrow(/no material matches "MADE-UP"/);
    expect(await svc.listLines(pr.id)).toHaveLength(0);
  });

  it('refuses an obsolete material on NEW demand', async () => {
    const { svc, pr, catalogue } = await harness();
    catalogue.add('OLD-CAM', { obsolete: true });
    await expect(svc.addLine({ prId: pr.id, material: 'OLD-CAM', quantity: 1 }))
      .rejects.toThrow(/obsolete and is not active for new demand/);
  });

  it('numbers lines in the order they were authored', async () => {
    const { svc, pr } = await harness();
    await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1 });
    await svc.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 2 });
    expect((await svc.listLines(pr.id)).map((l) => l.lineNo)).toEqual([1, 2]);
  });
});

describe('a line is coded to its own project, or not at all', () => {
  it('accepts a WBS and cost node that belong to the requisition’s project', async () => {
    const { svc, pr, coding } = await harness();
    coding.nodes.set('wbs:wbs-1', 'proj-1');
    coding.nodes.set('cbs:cbs-1', 'proj-1');
    const line = await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1, wbsNodeId: 'wbs-1', cbsNodeId: 'cbs-1' });
    expect(line).toMatchObject({ wbsNodeId: 'wbs-1', cbsNodeId: 'cbs-1' });
  });

  it('refuses a node belonging to a DIFFERENT project', async () => {
    const { svc, pr, coding } = await harness();
    coding.nodes.set('wbs:wbs-other', 'proj-2');
    await expect(svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1, wbsNodeId: 'wbs-other' }))
      .rejects.toThrow(/WBS node wbs-other does not belong to this requisition's project/);
  });

  it('refuses a WBS id offered as a cost code, even on the right project', async () => {
    const { svc, pr, coding } = await harness();
    coding.nodes.set('wbs:wbs-1', 'proj-1'); // registered as WBS only
    await expect(svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1, cbsNodeId: 'wbs-1' }))
      .rejects.toThrow(/cost node wbs-1 does not belong/);
  });

  it('REFUSES rather than passes when the coding authority is unavailable', async () => {
    // An absent resolver cannot confirm anything. Accepting the node would record a link nobody
    // checked — optional dependency, never optional evidence.
    const { svc, pr } = await harness({ coding: null });
    await expect(svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1, wbsNodeId: 'wbs-1' }))
      .rejects.toThrow(/project coding authority is unavailable/);
  });

  it('still allows a line with no coding at all when the authority is absent', async () => {
    const { svc, pr } = await harness({ coding: null });
    expect((await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1 })).wbsNodeId).toBeNull();
  });

  it('refuses coding on a requisition that belongs to no project', async () => {
    const { svc, pr } = await harness({ projectId: null });
    await expect(svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1, cbsNodeId: 'cbs-1' }))
      .rejects.toThrow(/requires the requisition to belong to a project first/);
  });
});

describe('lines are what was submitted', () => {
  it('refuses to add, edit or remove a line once the requisition has left draft', async () => {
    const { svc, pr, requests } = await harness();
    const line = await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 1 });
    await requests.update({ ...pr, status: 'submitted' });

    await expect(svc.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 1 })).rejects.toThrow(/only be changed while it is a draft/);
    await expect(svc.editLine(line.id, { quantity: 99 })).rejects.toThrow(/only be changed while it is a draft/);
    await expect(svc.removeLine(line.id)).rejects.toThrow(/only be changed while it is a draft/);
  });

  it('edits the demand but never the material or its description', async () => {
    const { svc, pr } = await harness();
    const line = await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    const edited = await svc.editLine(line.id, { quantity: 12, estimatedUnitCost: 460, notes: 'urgent' });
    expect(edited).toMatchObject({ quantity: 12, estimatedUnitCost: 460, notes: 'urgent' });
    // Identity and snapshot are untouched, and the line keeps its id and authored time.
    expect(edited).toMatchObject({ id: line.id, materialId: line.materialId, materialName: line.materialName, uom: 'nr' });
    expect(edited.createdAt).toBe(line.createdAt);
  });

  it('applies the domain rules again on edit — a quantity cannot be edited down to nothing', async () => {
    const { svc, pr } = await harness();
    const line = await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10 });
    await expect(svc.editLine(line.id, { quantity: 0 })).rejects.toThrow(/greater than zero/);
  });

  it('closes the numbering gap when a middle line is removed', async () => {
    const { svc, pr } = await harness();
    await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 1 });
    const second = await svc.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 2 });
    await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 3 });

    await svc.removeLine(second.id);

    const remaining = await svc.listLines(pr.id);
    expect(remaining.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(remaining.map((l) => l.quantity)).toEqual([1, 3]);
  });
});

describe('the value that governs the requisition', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeEach(async () => { h = await harness(); });

  it('is the authored header figure while the requisition has no lines', async () => {
    await h.requests.update({ ...h.pr, value: 7500 });
    expect(await h.svc.governingValue(h.pr.id)).toEqual({ value: 7500, derived: false });
  });

  it('is derived from the lines once they exist, and the header no longer speaks', async () => {
    await h.requests.update({ ...h.pr, value: 999_999 });
    await h.svc.addLine({ prId: h.pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    expect(await h.svc.governingValue(h.pr.id)).toEqual({ value: 4500, derived: true });
  });

  it('is NULL, not the stale header, while a line is unpriced', async () => {
    await h.requests.update({ ...h.pr, value: 999_999 });
    await h.svc.addLine({ prId: h.pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    await h.svc.addLine({ prId: h.pr.id, material: 'CBL-CAT6', quantity: 250 });
    expect(await h.svc.governingValue(h.pr.id)).toEqual({ value: null, derived: true });
  });

  it('reports progress on a half-priced draft without calling it the value', async () => {
    await h.svc.addLine({ prId: h.pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    await h.svc.addLine({ prId: h.pr.id, material: 'CBL-CAT6', quantity: 250 });
    expect(await h.svc.total(h.pr.id)).toMatchObject({
      lineCount: 2, pricedCount: 1, unpricedCount: 1, pricedSubtotal: 4500, complete: false, value: null,
    });
  });
});

describe('submission readiness', () => {
  it('refuses a line-based requisition while anything is unpriced', async () => {
    const { svc, pr } = await harness();
    await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    await svc.addLine({ prId: pr.id, material: 'CBL-CAT6', quantity: 250 });
    const verdict = await svc.submissionReadiness(pr.id);
    expect(verdict.ready).toBe(false);
    expect(verdict.reason).toMatch(/decides who may approve it/);
    expect(verdict.reason).toContain('line 2 (CBL-CAT6)');
  });

  it('allows it once every line is priced', async () => {
    const { svc, pr } = await harness();
    await svc.addLine({ prId: pr.id, material: 'CAM-DOME-4MP', quantity: 10, estimatedUnitCost: 450 });
    expect(await svc.submissionReadiness(pr.id)).toEqual({ ready: true });
  });

  it('leaves a LEGACY requisition with no lines exactly as it was', async () => {
    // Refusing these now would invalidate historical records rather than improve any of them.
    const { svc, pr } = await harness();
    expect(await svc.submissionReadiness(pr.id)).toEqual({ ready: true });
  });
});

describe('tenant scoping', () => {
  it('will not read a requisition belonging to another tenant', async () => {
    const { svc, requests } = await harness();
    const foreign = makePurchaseRequest({ tenantId: 't2', title: 'Someone else’s job', value: 1, createdBy: 'u-x' });
    await requests.create(foreign);
    await expect(svc.addLine({ prId: foreign.id, material: 'CAM-DOME-4MP', quantity: 1 })).rejects.toThrow();
  });
});
