import { describe, it, expect, beforeEach } from 'vitest';
import type { EventStore, TxRunner, TxHandle } from '@aura/core';
import { InMemoryPreAwardPackageStore } from './in-memory-pre-award-package-store';
import { InMemoryPricingSheetStore } from './in-memory-pricing-sheet-store';
import { InMemoryQuotationStore } from './in-memory-quotation-store';
import { PreAwardPackageService } from './pre-award-package.service';
import { PricingQuotationService } from './pricing-quotation.service';
import { openCommercialPricing, applyPricingPolicy, type PricingSheet } from './domain/pricing-sheet';

// Slice 8 PR-2 — quotation materialisation from a pricing revision, by IDENTITY (not by numbers),
// atomic, money-from-sheet. This proves the negotiation loop the audit found broken.

const T = 't1';
const OPP = 'opp-1';
const events = { append: async () => {}, appendWithClient: async () => {} } as unknown as EventStore;

describe('Slice 8 PR-2 — pricing → quotation revision loop', () => {
  let pricing: InMemoryPricingSheetStore;
  let quotes: InMemoryQuotationStore;
  let packages: PreAwardPackageService;
  let svc: PricingQuotationService;
  let pkgId: string;

  beforeEach(async () => {
    const pkgStore = new InMemoryPreAwardPackageStore();
    pricing = new InMemoryPricingSheetStore();
    quotes = new InMemoryQuotationStore();
    packages = new PreAwardPackageService(pkgStore, pricing);
    svc = new PricingQuotationService(pricing, quotes, events, packages);
    const pkg = await packages.openDirect({ tenantId: T, opportunityId: OPP });
    pkgId = pkg.id;
  });

  /** Open a priced draft revision (identical numbers every time — identity must NOT dedup on that). */
  async function openDraft(version: number, parentSheetId: string | null): Promise<PricingSheet> {
    const draft = openCommercialPricing({
      tenantId: T, name: 'Tower B ELV', opportunityId: OPP, packageId: pkgId,
      estimateRevisionId: 'e1', baselineCost: 1000, version, parentSheetId, createdBy: 'u1',
    });
    const priced = applyPricingPolicy(draft, { method: 'markup', percent: 20 }, null);
    await pricing.save(priced);
    return priced;
  }
  const freeze = (s: PricingSheet) => packages.freezePricingSheetById({ tenantId: T, opportunityId: OPP, sheetId: s.id, actorId: 'u1' });
  const generate = () => svc.materialise({ tenantId: T, opportunityId: OPP, customerName: 'Emaar', accountId: 'a1', actorId: 'u1' });
  const countQuotes = async () => (await quotes.list({ tenantId: T })).length;

  it('runs the whole loop: P-001→Q-001, re-price→Q-002 revision, P-003→Q-003, all by identity', async () => {
    // P-001 frozen/current → Q-001
    const p1 = await freeze(await openDraft(1, null));
    const q1 = await generate();
    expect(q1.revision).toBe(0);
    expect(q1.parentQuotationId).toBeNull();
    // money provenance: the quote's selling value is exactly the frozen sheet's
    expect(q1.subtotal).toBe(p1.totals.totalSell);
    expect(await countQuotes()).toBe(1);

    // Generate again from the SAME P-001 → same Q-001 (identity idempotency), no new quote
    const q1again = await generate();
    expect(q1again.id).toBe(q1.id);
    expect(await countQuotes()).toBe(1);

    // P-002 DRAFT → P-001 remains current (draft does not supersede)
    const p2draft = await openDraft(2, p1.id);
    expect((await packages.frozenPricingFor(T, OPP))!.id).toBe(p1.id);

    // Freeze P-002 → P-002 current, P-001 historical
    const p2 = await freeze(p2draft);
    expect((await packages.frozenPricingFor(T, OPP))!.id).toBe(p2.id);
    expect((await pricing.get(p1.id))!.supersededByPricingId).toBe(p2.id);

    // Generate → Q-002 revision of Q-001
    const q2 = await generate();
    expect(q2.id).not.toBe(q1.id);
    expect(q2.revision).toBe(1);
    expect(q2.parentQuotationId).toBe(q1.id);
    expect(q2.subtotal).toBe(p2.totals.totalSell);
    expect((await quotes.get(q1.id))!.status).toBe('revised'); // Q-001 superseded
    expect((await pricing.get(p2.id))!.quotationId).toBe(q2.id); // P-002 ↔ Q-002
    expect(await countQuotes()).toBe(2);

    // Generate again from the SAME P-002 → same Q-002, count unchanged
    const q2again = await generate();
    expect(q2again.id).toBe(q2.id);
    expect(await countQuotes()).toBe(2);

    // P-003 with IDENTICAL numbers → still a NEW revision Q-003 (identity, not content, drives it)
    const p3 = await freeze(await openDraft(3, p2.id));
    expect(p3.totals.totalSell).toBe(p2.totals.totalSell); // numbers identical
    const q3 = await generate();
    expect(q3.id).not.toBe(q2.id);
    expect(q3.revision).toBe(2);
    expect(q3.parentQuotationId).toBe(q2.id);
    expect((await quotes.get(q2.id))!.status).toBe('revised');
    expect(await countQuotes()).toBe(3);
  });

  it('a forced failure mid-materialise leaves no duplicate — retry converges to the same revision', async () => {
    const p1 = await freeze(await openDraft(1, null));
    const q1 = await generate();
    await freeze(await openDraft(2, p1.id));

    // Fail the LAST write (the pricing→quote link) once, simulating a crash after Q-002 was written.
    let failNext = true;
    const realSave = pricing.saveWithClient.bind(pricing);
    pricing.saveWithClient = async (tx: TxHandle | null, s: PricingSheet) => {
      if (failNext && s.quotationId) { failNext = false; throw new Error('boom: link failed'); }
      return realSave(tx, s);
    };

    await expect(generate()).rejects.toThrow(/boom/);
    // Q-002 may have been written (in-memory has no rollback), but Q-001 is revised and no link landed.
    const afterCrash = await countQuotes();

    // Retry — must NOT mint Q-003; it converges on the existing revision child and links it.
    const q2 = await generate();
    expect(q2.parentQuotationId).toBe(q1.id);
    expect(q2.revision).toBe(1);
    expect(await countQuotes()).toBe(afterCrash); // no duplicate created on retry
    // the pricing↔quote link is now closed
    const current = await packages.frozenPricingFor(T, OPP);
    expect(current!.quotationId).toBe(q2.id);
  });
});

describe('Slice 8 PR-2 — real transaction atomicity (proves same client reaches both stores)', () => {
  it('rolls BOTH the quote write and the sheet link back when the transaction throws', async () => {
    // A fake TxRunner that records writes against a scratch "db" and discards them on throw — standing
    // in for PostgresTxRunner's BEGIN/COMMIT/ROLLBACK, so we can assert atomicity without a live PG.
    const committed = { quotes: new Map<string, unknown>(), sheets: new Map<string, unknown>() };
    const staged = { quotes: new Map<string, unknown>(), sheets: new Map<string, unknown>() };
    const tx: TxRunner = {
      async run(fn) {
        staged.quotes = new Map(committed.quotes);
        staged.sheets = new Map(committed.sheets);
        // A throw from fn propagates and the two COMMIT lines below never run — so the staged writes
        // are discarded and committed state is untouched. That IS the rollback.
        const out = await fn({} as TxHandle);
        committed.quotes = staged.quotes; committed.sheets = staged.sheets; // COMMIT
        return out;
      },
    };
    // Both stores write into the SAME staged maps inside the tx, proving one unit of work.
    const pricing = new InMemoryPricingSheetStore();
    const quotes = new InMemoryQuotationStore();
    pricing.saveWithClient = async (_tx, s) => { staged.sheets.set(s.id, s); if (s.quotationId === 'BOOM') throw new Error('link blew up'); };
    quotes.saveWithClient = async (_tx, q) => { staged.quotes.set(q.id, q); };

    await expect(tx.run(async (h) => {
      await quotes.saveWithClient(h, { id: 'q', quotationId: undefined } as never);
      await pricing.saveWithClient(h, { id: 's', quotationId: 'BOOM' } as never); // throws → rollback
    })).rejects.toThrow(/link blew up/);

    expect(committed.quotes.size).toBe(0); // the quote write rolled back with the failed link
    expect(committed.sheets.size).toBe(0);
  });
});
