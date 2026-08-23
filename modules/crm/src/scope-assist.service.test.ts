import { describe, it, expect, vi } from 'vitest';
import type { AiService } from '@aura/core';
import { ScopeAssistService } from './scope-assist.service';
import { InMemoryScopeAssistStore } from './in-memory-scope-assist-store';
import { InMemoryPreAwardStore } from './in-memory-pre-award-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { makeRequirement } from './domain/solution-scope';

/** A stub AiService whose `complete` returns whatever text the test wants (or throws). */
function stubAi(text: string | (() => never)): AiService {
  return { complete: vi.fn(async () => (typeof text === 'function' ? text() : { text, model: 'stub', provider: 'stub' })) } as unknown as AiService;
}
const localEcho = stubAi('[local-ai] no model configured'); // not JSON → generation falls to heuristic grounding

function harness(ai: AiService = localEcho) {
  const evidence = new InMemoryPreAwardStore();
  const packages = new PreAwardPackageService(new InMemoryPreAwardPackageStore(), new InMemoryPricingSheetStore());
  const svc = new ScopeAssistService(new InMemoryScopeAssistStore(), evidence, ai, packages);
  return { svc, evidence, packages };
}

async function seedReq(evidence: InMemoryPreAwardStore, tenantId: string, opportunityId: string, title: string) {
  const r = makeRequirement({ tenantId, opportunityId, title, priority: 'must' });
  await evidence.saveRequirement(r);
  return r;
}

describe('ScopeAssistService — grounded generation', () => {
  it('grounds items on the deal\'s own evidence, each with real provenance (heuristic floor when no model)', async () => {
    const { svc, evidence } = harness();
    const r = await seedReq(evidence, 't1', 'o1', '32 IP cameras with NVR');
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    expect(p.items).toHaveLength(1);
    expect(p.items[0].provenance[0].sourceId).toBe(r.id); // cites the real requirement
    expect(p.generator).toContain('heuristic');
  });

  it('generation changes NO other lifecycle state — no package/basis/estimate/pricing created', async () => {
    const { svc, evidence, packages } = harness();
    await seedReq(evidence, 't1', 'o1', 'Access control for 5 doors');
    await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    const agg = await packages.readAggregate('t1', 'o1');
    expect(agg.package).toBeNull();
    expect(agg.governance.governed).toBe(false);
  });

  it('an AI outage does not block generation (falls back to grounded heuristic)', async () => {
    const throwing = stubAi(() => { throw new Error('model down'); });
    const { svc, evidence } = harness(throwing);
    await seedReq(evidence, 't1', 'o1', 'PA/VA in 3 zones');
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    expect(p.items).toHaveLength(1);
  });

  it('no evidence → no invented scope; a gap asks for evidence', async () => {
    const { svc } = harness();
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o-empty' });
    expect(p.items).toHaveLength(0);
    expect(p.gaps.length).toBeGreaterThan(0);
  });
});

describe('ScopeAssistService — tenant/evidence isolation (CRITICAL)', () => {
  it('never cites another tenant\'s source even when the model returns a perfect cross-tenant match', async () => {
    // Two tenants with IDENTICAL requirement text — a perfect semantic match across the boundary.
    const evidence = new InMemoryPreAwardStore();
    const mine = await seedReq(evidence, 'tenantA', 'oppA', '48 IP cameras, NVR, 30-day retention');
    const theirs = await seedReq(evidence, 'tenantB', 'oppB', '48 IP cameras, NVR, 30-day retention');

    // A malicious/confused model tries to cite tenant B's requirement id for tenant A's deal.
    const crossTenantAi = stubAi(JSON.stringify({
      items: [
        { description: '48 IP cameras', unit: 'no', quantity: 48, provenance: [{ kind: 'requirement', sourceId: theirs.id, excerpt: 'cross-tenant' }] },
      ],
      assumptions: [], gaps: [],
    }));
    const packages = new PreAwardPackageService(new InMemoryPreAwardPackageStore(), new InMemoryPricingSheetStore());
    const svc = new ScopeAssistService(new InMemoryScopeAssistStore(), evidence, crossTenantAi, packages);

    const p = await svc.generate({ tenantId: 'tenantA', opportunityId: 'oppA' });

    // The cross-tenant item is DROPPED; no provenance anywhere references tenant B's source.
    const allProvenanceIds = p.items.flatMap((i) => i.provenance.map((pr) => pr.sourceId));
    expect(allProvenanceIds).not.toContain(theirs.id);
    // The floor grounds ONLY on tenant A's own evidence.
    expect(allProvenanceIds).toEqual([mine.id]);
    // A gap records the discard rather than silently swallowing it.
    expect(p.gaps.some((g) => /not backed by this deal's evidence/i.test(g.question))).toBe(true);
  });
});

describe('ScopeAssistService — accept ≠ approve', () => {
  it('accept creates a DRAFT basis (not approved); approval is a separate command', async () => {
    const { svc, evidence, packages } = harness();
    await seedReq(evidence, 't1', 'o1', 'Intercom for 12 apartments');
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });

    const { proposal, basis } = await svc.accept({ tenantId: 't1', opportunityId: 'o1', proposalId: p.id, actorId: 'u1' });
    expect(proposal.status).toBe('accepted');
    expect(proposal.acceptedBasisRevisionId).toBe(basis.id);
    expect(basis.status).toBe('draft'); // editable — NOT approved

    // Governance: scope NOT yet approved (accept did not approve).
    let g = await packages.governance('t1', 'o1');
    expect(g.governed).toBe(true);
    expect(g.scopeApproved).toBe(false);

    // Approval is the independent human command (keyed by package + basis id).
    const pkgId = (await packages.readAggregate('t1', 'o1')).package!.id;
    await packages.approveScopeBasisById('t1', pkgId, basis.id, 'u2');
    g = await packages.governance('t1', 'o1');
    expect(g.scopeApproved).toBe(true);
  });

  it('a proposal cannot be accepted twice', async () => {
    const { svc, evidence } = harness();
    await seedReq(evidence, 't1', 'o1', 'Barrier gate x2');
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    await svc.accept({ tenantId: 't1', opportunityId: 'o1', proposalId: p.id });
    await expect(svc.accept({ tenantId: 't1', opportunityId: 'o1', proposalId: p.id })).rejects.toThrow(/only a suggested proposal/i);
  });
});

describe('ScopeAssistService — regenerate + evidence staleness', () => {
  it('regenerate = a new version; a still-open suggestion is superseded, an accepted one is preserved', async () => {
    const { svc, evidence } = harness();
    await seedReq(evidence, 't1', 'o1', 'CCTV');

    const v1 = await svc.generate({ tenantId: 't1', opportunityId: 'o1' }); // suggested
    const v2 = await svc.generate({ tenantId: 't1', opportunityId: 'o1' }); // supersedes v1
    expect(v2.version).toBe(2);
    let read = await svc.read('t1', 'o1');
    expect(read.find((x) => x.id === v1.id)!.status).toBe('superseded');

    // Accept v2, then regenerate v3 — v2 stays accepted (historical), not rewritten.
    await svc.accept({ tenantId: 't1', opportunityId: 'o1', proposalId: v2.id });
    const v3 = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    expect(v3.version).toBe(3);
    read = await svc.read('t1', 'o1');
    expect(read.find((x) => x.id === v2.id)!.status).toBe('accepted');
  });

  it('evidenceStale is DERIVED: adding evidence marks an earlier proposal stale', async () => {
    const { svc, evidence } = harness();
    await seedReq(evidence, 't1', 'o1', 'CCTV');
    const p = await svc.generate({ tenantId: 't1', opportunityId: 'o1' });
    expect((await svc.read('t1', 'o1')).find((x) => x.id === p.id)!.evidenceStale).toBe(false);

    await seedReq(evidence, 't1', 'o1', 'Access control (added later)');
    expect((await svc.read('t1', 'o1')).find((x) => x.id === p.id)!.evidenceStale).toBe(true);
  });
});
