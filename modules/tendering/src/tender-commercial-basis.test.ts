import { describe, it, expect, beforeEach } from 'vitest';
import {
  EventBus, InMemoryEventStore, NullTxRunner, AccessService, IdempotencyService, LockService,
  CommandBus, NumberingService, AuditService, TenantContext,
} from '@aura/core';
import { TenderService } from './tender.service';
import { InMemoryTenderStore } from './in-memory-tender-store';
import { InMemoryBOQStore } from './in-memory-boq-store';
import { InMemoryBidScoreStore } from './in-memory-bid-score-store';
import { InMemoryEstimateStore } from './in-memory-estimate-store';
import { InMemorySubmissionStore } from './in-memory-submission-store';
import { makeTenderCommercialBasis, readTenderCommercialBasis, TENDER_COMMERCIAL_BASIS_VERSION } from './domain/tender-commercial-basis';

/**
 * ADR-0021 follow-up — the award's COMMERCIAL BASIS.
 *
 * The invariant table this file exists to hold, case for case. The through-line: the contract's
 * value is fixed by an approved baseline pinned to the award, and `Tender.value` — our estimate —
 * is never a source for it under any circumstance.
 */

const tenantId = 't-basis';
const AWARDED_AT = '2026-08-21T07:30:00.000Z';
const LOCKED_AT = '2026-08-22T09:00:00.000Z';

function buildHarness() {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const tx = new NullTxRunner();
  const tenant = new TenantContext();
  const commands = new CommandBus(new AccessService(), new IdempotencyService(null), new LockService(), tx);
  const bidScoreStore = new InMemoryBidScoreStore();
  const estimateStore = new InMemoryEstimateStore();
  const store = new InMemoryTenderStore();
  const tenders = new TenderService(
    store, new InMemoryBOQStore(), bidScoreStore, estimateStore, new InMemorySubmissionStore(),
    events, tx, commands, new NumberingService(null), new AuditService(null, tenant),
  );
  tenders.onModuleInit();
  return { tenders, store, bidScoreStore, estimateStore };
}
type H = ReturnType<typeof buildHarness>;

async function submittable(h: H, tenderId: string): Promise<void> {
  await h.bidScoreStore.save({ id: `bs-${tenderId}`, tenantId, tenderId, recommendation: 'go', createdAt: new Date().toISOString() } as never);
  await h.estimateStore.save({ id: `est-${tenderId}`, tenantId, tenderId, sellingRate: 100, quantity: 1 } as never);
  await h.tenders.changeStatus(tenderId, 'submitted');
}

const evidence = { awardedValue: 700_000, currency: 'AED', awardedAt: AWARDED_AT, capturedBy: 'u-bid-manager' };
const BASIS = { baselineId: 'baseline-1', quotationId: 'q-1', value: 640_000 };

describe('makeTenderCommercialBasis / read — the domain gate', () => {
  it('requires a kind, a baseline, a quotation, a finite value and an establishedAt', () => {
    const base = { ...BASIS, kind: 'AT_AWARD' as const, establishedAt: AWARDED_AT };
    expect(() => makeTenderCommercialBasis({ ...base, kind: 'WHENEVER' as never })).toThrow(/requires a kind/i);
    expect(() => makeTenderCommercialBasis({ ...base, baselineId: '' })).toThrow(/requires the baseline/i);
    expect(() => makeTenderCommercialBasis({ ...base, quotationId: '' })).toThrow(/requires the quotation/i);
    expect(() => makeTenderCommercialBasis({ ...base, value: Number.NaN })).toThrow(/requires a value/i);
    expect(() => makeTenderCommercialBasis({ ...base, value: -1 })).toThrow(/must be 0 or more/i);
    expect(() => makeTenderCommercialBasis({ ...base, establishedAt: 'nope' })).toThrow(/must be a valid date/i);
  });

  it('THE ZERO RULE: an approved total of 0 is a real basis', () => {
    const b = makeTenderCommercialBasis({ ...BASIS, value: 0, kind: 'AT_AWARD', establishedAt: AWARDED_AT });
    expect(b.value).toBe(0);
    expect(readTenderCommercialBasis(b)!.value).toBe(0);
  });

  it('the reader refuses a wrong version or a broken field rather than half-reading a basis', () => {
    const good = makeTenderCommercialBasis({ ...BASIS, kind: 'AT_AWARD', establishedAt: AWARDED_AT });
    expect(good.version).toBe(TENDER_COMMERCIAL_BASIS_VERSION);
    expect(readTenderCommercialBasis({ ...good, version: 99 })).toBeNull();
    expect(readTenderCommercialBasis({ ...good, kind: 'SOMETIME' })).toBeNull();
    expect(readTenderCommercialBasis({ ...good, value: 'lots' })).toBeNull();
    expect(readTenderCommercialBasis({ ...good, baselineId: '' })).toBeNull();
    expect(readTenderCommercialBasis(null)).toBeNull();
  });
});

describe('the invariant table — award, defer, link', () => {
  let h: H;
  beforeEach(() => { h = buildHarness(); });

  const ready = async (value = 800_000) => {
    const t = await h.tenders.create({ tenantId, title: 'Tender: Basis', value });
    await submittable(h, t.id);
    return t;
  };

  it('CASE 1 — award WITH a basis pins it as AT_AWARD, dated to the award', async () => {
    const t = await ready();
    const awarded = await h.tenders.award(t.id, evidence, BASIS);

    expect(awarded.commercialBasis!.kind).toBe('AT_AWARD');
    expect(awarded.commercialBasis!.baselineId).toBe('baseline-1');
    expect(awarded.commercialBasis!.value).toBe(640_000);
    // Dated to the AWARD instant, not to when this ran.
    expect(awarded.commercialBasis!.establishedAt).toBe(AWARDED_AT);
    // CASE 8 — the estimate is untouched and is a different number from the basis.
    expect(awarded.value).toBe(800_000);
    expect(awarded.commercialBasis!.value).not.toBe(awarded.value);
  });

  it('CASE 2 — award WITHOUT a basis is legitimate: won, and awaiting a commercial basis', async () => {
    const t = await ready();
    const awarded = await h.tenders.award(t.id, evidence, null);

    expect(awarded.status).toBe('won');
    expect(awarded.awardEvidence).not.toBeNull();  // the win is fully evidenced…
    expect(awarded.commercialBasis).toBeNull();    // …and still has no commercial basis
    expect((await h.store.get(t.id))!.commercialBasis).toBeNull();
  });

  it('CASE 3 — a baseline locking later links as POST_AWARD_LINKED, dated to the LOCK', async () => {
    const t = await ready();
    await h.tenders.award(t.id, evidence, null);

    const { tender, linked } = await h.tenders.linkCommercialBasis(t.id, { ...BASIS, establishedAt: LOCKED_AT });
    expect(linked).toBe(true);
    expect(tender.commercialBasis!.kind).toBe('POST_AWARD_LINKED'); // NOT AT_AWARD — a different claim
    expect(tender.commercialBasis!.establishedAt).toBe(LOCKED_AT);  // and NOT misdated to the award
  });

  it('CASE 4 — replaying the same link is a no-op, never a rewrite', async () => {
    const t = await ready();
    await h.tenders.award(t.id, evidence, null);
    await h.tenders.linkCommercialBasis(t.id, { ...BASIS, establishedAt: LOCKED_AT });

    const again = await h.tenders.linkCommercialBasis(t.id, { ...BASIS, establishedAt: LOCKED_AT });
    expect(again.linked).toBe(false);
    expect(again.tender.commercialBasis!.baselineId).toBe('baseline-1');
  });

  it('CASE 4b — a DIFFERENT baseline locking later never re-bases an established award', async () => {
    // The race that matters: a contract may already have been built on the first basis. Re-basing it
    // would silently change a contractual value.
    const t = await ready();
    await h.tenders.award(t.id, evidence, BASIS);

    const competing = await h.tenders.linkCommercialBasis(t.id, {
      baselineId: 'baseline-2', quotationId: 'q-2', value: 9_999_999, establishedAt: LOCKED_AT,
    });
    expect(competing.linked).toBe(false);
    const stored = (await h.store.get(t.id))!;
    expect(stored.commercialBasis!.baselineId).toBe('baseline-1');  // history stands
    expect(stored.commercialBasis!.value).toBe(640_000);
    expect(stored.commercialBasis!.kind).toBe('AT_AWARD');
  });

  it('CASE 7 — a basis cannot be linked to a tender that was never won', async () => {
    const t = await ready();
    await expect(h.tenders.linkCommercialBasis(t.id, { ...BASIS, establishedAt: LOCKED_AT }))
      .rejects.toThrow(/can only be linked to a tender that has been won/i);
    expect((await h.store.get(t.id))!.commercialBasis).toBeNull();
  });

  it('CASE 8 — no code path turns the estimate into a basis, even with no baseline in sight', async () => {
    const t = await ready(1_234_567);
    const awarded = await h.tenders.award(t.id, evidence, null);
    // The tender knows its own estimate and still reports NO basis. Absence is absence.
    expect(awarded.value).toBe(1_234_567);
    expect(awarded.commercialBasis).toBeNull();
  });

  it('a rejected award leaves no basis behind either', async () => {
    const t = await ready();
    await expect(h.tenders.award(t.id, { ...evidence, currency: '' }, BASIS)).rejects.toThrow(/requires a currency/i);
    const after = (await h.store.get(t.id))!;
    expect(after.status).toBe('submitted');
    expect(after.commercialBasis).toBeNull();
  });
});
