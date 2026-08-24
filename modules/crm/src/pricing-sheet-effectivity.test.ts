import { describe, it, expect } from 'vitest';
import {
  openCommercialPricing, applyPricingPolicy, freezeSheet, linkQuotation, supersedeSheet,
  isCurrentlyEffective, isHistoricallyFrozen, type PricingSheet,
} from './domain/pricing-sheet';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';

// Slice 8, PR-1 — pricing sheet EFFECTIVITY (current vs historically-frozen).
//
// These prove the scenarios agreed before the migration was written. The guiding rule from the brief:
// re-pricing must never destroy the previously-frozen revision — it may have produced a quotation and
// carries audit we will need for Auto-Won. So "currently effective" is modelled orthogonally to
// `status`; a superseded revision stays `frozen` with all its committed facts intact.
//
// PR-1 proves supersession as an explicit domain op + deterministic store reads. Wiring it into the
// live freeze path (freeze v2 ⇒ supersede v1, atomically) is PR-2 and is deliberately NOT here.

const BASE = { tenantId: 't1', name: 'Tower B ELV', opportunityId: 'o1', packageId: 'pkg1', estimateRevisionId: 'e1', baselineCost: 1000 };

function openDraft(version = 1, parentSheetId: string | null = null, now?: Date): PricingSheet {
  return openCommercialPricing({ ...BASE, version, parentSheetId, createdBy: 'u1' }, now);
}
function priceAndFreeze(sheet: PricingSheet, actor: string, now: Date): PricingSheet {
  return freezeSheet(applyPricingPolicy(sheet, { method: 'markup', percent: 20 }, null), actor, now);
}

describe('Slice 8 — pricing sheet effectivity', () => {
  // Scenario: P-001 frozen ⇒ current.
  it('a freshly frozen P-001 is the current effective price', () => {
    const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    expect(v1.status).toBe('frozen');
    expect(v1.supersededAt).toBeNull();
    expect(isCurrentlyEffective(v1)).toBe(true);
    expect(isHistoricallyFrozen(v1)).toBe(false);
  });

  // Scenario: P-001 → Q-001.
  it('P-001 can carry its produced quotation and stays current', () => {
    const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    const linked = linkQuotation(v1, 'Q-001');
    expect(linked.quotationId).toBe('Q-001');
    expect(isCurrentlyEffective(linked)).toBe(true);
  });

  // Scenario: a P-002 DRAFT must NOT supersede P-001 yet.
  it('opening a P-002 draft does not disturb the current P-001', () => {
    const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    const v2draft = openDraft(2, v1.id); // negotiation opens a re-price; nothing is committed yet
    expect(v2draft.status).toBe('draft');
    expect(isCurrentlyEffective(v2draft)).toBe(false);
    // v1 is untouched — no supersession happens on a draft
    expect(isCurrentlyEffective(v1)).toBe(true);
  });

  // Scenario: P-002 frozen ⇒ P-002 current, P-001 historical — and P-001 keeps ALL its audit.
  it('freezing P-002 makes it current and P-001 historical, preserving P-001 audit + Q-001 linkage', () => {
    const v1frozen = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    const v1 = linkQuotation(v1frozen, 'Q-001'); // P-001 produced Q-001
    const v2 = priceAndFreeze(openDraft(2, v1.id), 'u2', new Date('2026-02-01T00:00:00Z'));

    const v1hist = supersedeSheet(v1, { pricingId: v2.id, actorId: 'u2' }, new Date('2026-02-01T00:00:00Z'));

    // effectivity flipped
    expect(isCurrentlyEffective(v2)).toBe(true);
    expect(isCurrentlyEffective(v1hist)).toBe(false);
    expect(isHistoricallyFrozen(v1hist)).toBe(true);
    expect(v1hist.supersededByPricingId).toBe(v2.id);
    expect(v1hist.supersededBy).toBe('u2');

    // history is NOT destroyed — the whole committed record survives on the historical revision
    expect(v1hist.status).toBe('frozen');
    expect(v1hist.frozenAt).toBe(v1.frozenAt);
    expect(v1hist.frozenBy).toBe('u1');
    expect(v1hist.quotationId).toBe('Q-001');
    expect(v1hist.commercial).toEqual(v1.commercial);
    expect(v1hist.lines).toEqual(v1.lines);
    expect(v1hist.totals).toEqual(v1.totals);
  });

  // Scenario: a FAILED P-002 freeze must leave P-001 current.
  it('a failed P-002 freeze leaves P-001 current (supersede is never reached)', () => {
    const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    const v2NoPolicy = openDraft(2, v1.id); // no policy chosen → cannot be frozen
    expect(() => freezeSheet(v2NoPolicy, 'u2')).toThrow(/without a policy/i);
    // freeze threw, so the caller never supersedes v1 — the current price is unchanged
    expect(isCurrentlyEffective(v1)).toBe(true);
    expect(v1.supersededAt).toBeNull();
  });

  describe('supersedeSheet guards', () => {
    it('refuses to supersede a draft', () => {
      const draft = openDraft(1);
      expect(() => supersedeSheet(draft, { pricingId: 'x', actorId: 'u2' })).toThrow(/only a frozen/i);
    });
    it('refuses to supersede itself', () => {
      const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
      expect(() => supersedeSheet(v1, { pricingId: v1.id, actorId: 'u2' })).toThrow(/cannot supersede itself/i);
    });
    it('is idempotent — re-superseding a historical revision is a no-op', () => {
      const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
      const once = supersedeSheet(v1, { pricingId: 'v2', actorId: 'u2' }, new Date('2026-02-01T00:00:00Z'));
      const twice = supersedeSheet(once, { pricingId: 'v3', actorId: 'u3' }, new Date('2026-03-01T00:00:00Z'));
      expect(twice).toEqual(once); // first supersession stands
    });
  });
});

describe('Slice 8 — current vs historical store reads (invariants)', () => {
  it('currentOnly returns exactly one frozen sheet per package; historical returns every revision', async () => {
    const store = new InMemoryPricingSheetStore();
    const v1frozen = priceAndFreeze(openDraft(1, null, new Date('2026-01-01T00:00:00Z')), 'u1', new Date('2026-01-01T00:00:00Z'));
    const v1 = linkQuotation(v1frozen, 'Q-001');
    const v2 = priceAndFreeze(openDraft(2, v1.id, new Date('2026-02-01T00:00:00Z')), 'u2', new Date('2026-02-01T00:00:00Z'));
    await store.save(v1);
    await store.save(v2);
    // v2 becomes current, v1 historical
    await store.save(supersedeSheet(v1, { pricingId: v2.id, actorId: 'u2' }, new Date('2026-02-01T00:00:00Z')));

    const current = await store.list({ tenantId: 't1', packageId: 'pkg1', status: 'frozen', currentOnly: true });
    expect(current.map((s) => s.id)).toEqual([v2.id]); // deterministic — exactly the current one

    const all = await store.list({ tenantId: 't1', packageId: 'pkg1', status: 'frozen' });
    expect(all.map((s) => s.id).sort()).toEqual([v1.id, v2.id].sort()); // history still readable
  });

  it('round-trips the effectivity columns through save/get', async () => {
    const store = new InMemoryPricingSheetStore();
    const v1 = priceAndFreeze(openDraft(1), 'u1', new Date('2026-01-01T00:00:00Z'));
    const hist = supersedeSheet(v1, { pricingId: 'v2-id', actorId: 'u2' }, new Date('2026-02-01T00:00:00Z'));
    await store.save(hist);
    const back = await store.get(hist.id);
    expect(back?.supersededAt).toBe(hist.supersededAt);
    expect(back?.supersededBy).toBe('u2');
    expect(back?.supersededByPricingId).toBe('v2-id');
  });
});
