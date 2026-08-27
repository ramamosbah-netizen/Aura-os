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
import { makeTenderAwardEvidence, readTenderAwardEvidence, TENDER_AWARD_EVIDENCE_VERSION } from './domain/tender-award-evidence';

/**
 * ADR-0021 — Tender Award Evidence.
 *
 * These cover the TENDERING half of the acceptance set: validation, the governed command, write-once
 * capture and the refusal to reach `won` any other way. The CRM half (provenance → GOVERNED_WON →
 * qualification-at-award) is proven end-to-end through the real reactor in
 * `apps/api/src/events/cross-module-subscriber.test.ts`, and the database half in the `.pg-int` suite.
 */

const tenantId = 't-award';
const AWARDED_AT = '2026-08-21T07:30:00.000Z';

function buildHarness() {
  const bus = new EventBus();
  const events = new InMemoryEventStore(bus);
  const tx = new NullTxRunner();
  const access = new AccessService();
  const commands = new CommandBus(access, new IdempotencyService(null), new LockService(), tx);
  const tenant = new TenantContext();
  const bidScoreStore = new InMemoryBidScoreStore();
  const estimateStore = new InMemoryEstimateStore();
  const store = new InMemoryTenderStore();
  const tenders = new TenderService(
    store, new InMemoryBOQStore(), bidScoreStore, estimateStore, new InMemorySubmissionStore(),
    events, tx, commands, new NumberingService(null), new AuditService(null, tenant),
  );
  tenders.onModuleInit();
  return { tenders, store, events, bus, bidScoreStore, estimateStore };
}

type H = ReturnType<typeof buildHarness>;

/** Walk a tender to `submitted` so the `won` gate is satisfied and only evidence is under test. */
async function submittable(h: H, tenderId: string): Promise<void> {
  await h.bidScoreStore.save({ id: `bs-${tenderId}`, tenantId, tenderId, recommendation: 'go', createdAt: new Date().toISOString() } as never);
  await h.estimateStore.save({ id: `est-${tenderId}`, tenantId, tenderId, sellingRate: 100, quantity: 1 } as never);
  await h.tenders.changeStatus(tenderId, 'submitted');
}

const evidence = (over: Record<string, unknown> = {}) => ({
  awardedValue: 1_000_000, currency: 'AED', awardedAt: AWARDED_AT, capturedBy: 'u-bid-manager', ...over,
});

describe('makeTenderAwardEvidence — the domain gate (money + currency + awardedAt)', () => {
  it('accepts the minimum structured evidence, with reference and document ABSENT', () => {
    // ACCEPTANCE 7 (inverse): awardReference / evidenceDocumentId are provenance, not validity gates.
    const e = makeTenderAwardEvidence(evidence());
    expect(e.awardReference).toBeNull();
    expect(e.evidenceDocumentId).toBeNull();
    expect(e.version).toBe(TENDER_AWARD_EVIDENCE_VERSION);
  });

  it('ACCEPTANCE 5: awardedValue = 0 is a REAL award, not an absent one', () => {
    // THE ZERO RULE. A `!awardedValue` test here would reject this, which is the bug class the
    // Opportunity 360 programme spent Phase 0 removing.
    const e = makeTenderAwardEvidence(evidence({ awardedValue: 0 }));
    expect(e.awardedValue).toBe(0);
  });

  it('ACCEPTANCE 7: rejects a missing or unusable awardedValue / currency / awardedAt', () => {
    expect(() => makeTenderAwardEvidence(evidence({ awardedValue: undefined }))).toThrow(/requires an awarded value/i);
    expect(() => makeTenderAwardEvidence(evidence({ awardedValue: Number.NaN }))).toThrow(/requires an awarded value/i);
    expect(() => makeTenderAwardEvidence(evidence({ awardedValue: Number.POSITIVE_INFINITY }))).toThrow(/requires an awarded value/i);
    expect(() => makeTenderAwardEvidence(evidence({ awardedValue: -1 }))).toThrow(/must be 0 or more/i);
    expect(() => makeTenderAwardEvidence(evidence({ currency: '' }))).toThrow(/requires a currency/i);
    expect(() => makeTenderAwardEvidence(evidence({ currency: '   ' }))).toThrow(/requires a currency/i);
    expect(() => makeTenderAwardEvidence(evidence({ awardedAt: '' }))).toThrow(/requires an award date/i);
    expect(() => makeTenderAwardEvidence(evidence({ awardedAt: 'not-a-date' }))).toThrow(/must be a valid date/i);
    expect(() => makeTenderAwardEvidence(evidence({ capturedBy: '' }))).toThrow(/requires the user who captured it/i);
  });

  it('normalises currency and keeps the CUSTOMER award date, not the capture time', () => {
    const e = makeTenderAwardEvidence(evidence({ currency: ' aed ' }));
    expect(e.currency).toBe('AED');
    expect(e.awardedAt).toBe(AWARDED_AT);
    expect(e.capturedAt).not.toBe(AWARDED_AT); // when WE recorded it — a different fact
  });
});

describe('readTenderAwardEvidence — refuses what it cannot fully parse', () => {
  it('round-trips valid evidence', () => {
    const e = makeTenderAwardEvidence(evidence({ awardReference: 'LOA-1' }));
    expect(readTenderAwardEvidence(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('returns null — never a partial award — for a wrong version or a broken field', () => {
    const good = makeTenderAwardEvidence(evidence());
    // A lenient reader would render these as a customer award. "Not evidenced" is the honest answer.
    expect(readTenderAwardEvidence({ ...good, version: 2 })).toBeNull();
    expect(readTenderAwardEvidence({ ...good, awardedValue: 'lots' })).toBeNull();
    expect(readTenderAwardEvidence({ ...good, awardedValue: -5 })).toBeNull();
    expect(readTenderAwardEvidence({ ...good, currency: '' })).toBeNull();
    expect(readTenderAwardEvidence({ ...good, awardedAt: 'nope' })).toBeNull();
    expect(readTenderAwardEvidence(null)).toBeNull();
    expect(readTenderAwardEvidence('award')).toBeNull();
  });

  it('a real 0 survives the reader — absence and zero stay distinct', () => {
    const zero = makeTenderAwardEvidence(evidence({ awardedValue: 0 }));
    expect(readTenderAwardEvidence(zero)!.awardedValue).toBe(0);
  });
});

describe('TenderService.award — the single governed path to won', () => {
  let h: H;
  beforeEach(() => { h = buildHarness(); });

  const newTender = async (over: Record<string, unknown> = {}) =>
    h.tenders.create({ tenantId, title: 'Tender: Marina ELV', value: 800_000, ...over });

  it('captures the evidence and transitions to won', async () => {
    const t = await newTender();
    await submittable(h, t.id);
    const awarded = await h.tenders.award(t.id, evidence({ awardReference: 'LOA-2026-31' }));

    expect(awarded.status).toBe('won');
    expect(awarded.awardEvidence!.awardedValue).toBe(1_000_000);
    expect(awarded.awardEvidence!.currency).toBe('AED');
    expect(awarded.awardEvidence!.awardedAt).toBe(AWARDED_AT);
    expect(awarded.awardEvidence!.awardReference).toBe('LOA-2026-31');
    expect((await h.store.get(t.id))!.awardEvidence).not.toBeNull();
  });

  it('ACCEPTANCE 4: the estimate and the submitted bid do not touch the Award Value', async () => {
    // The tender's own estimate is 800k and the submission records 800k; the customer awarded 1M.
    // None of our own numbers may leak into the award.
    const t = await newTender({ value: 800_000 });
    await submittable(h, t.id);
    const awarded = await h.tenders.award(t.id, evidence({ awardedValue: 1_000_000 }));

    expect(awarded.awardEvidence!.awardedValue).toBe(1_000_000);
    expect(awarded.value).toBe(800_000); // the estimate is UNTOUCHED — a separate concept
  });

  it('ACCEPTANCE 5: a genuine zero award is captured, not treated as no award', async () => {
    const t = await newTender();
    await submittable(h, t.id);
    const awarded = await h.tenders.award(t.id, evidence({ awardedValue: 0 }));
    expect(awarded.awardEvidence).not.toBeNull();
    expect(awarded.awardEvidence!.awardedValue).toBe(0);
  });

  it('ACCEPTANCE 7: an invalid award is refused BEFORE anything is written or emitted', async () => {
    const t = await newTender();
    await submittable(h, t.id);
    await expect(h.tenders.award(t.id, evidence({ currency: '' }))).rejects.toThrow(/requires a currency/i);

    const after = (await h.store.get(t.id))!;
    expect(after.status).toBe('submitted');   // NOT won
    expect(after.awardEvidence).toBeNull();
    // and no award reached the spine
    expect((await h.events.list({ tenantId })).some((e) => e.type === 'tendering.tender.awarded')).toBe(false);
  });

  it('ACCEPTANCE 8: an IDENTICAL award replayed is an idempotent no-op', async () => {
    const t = await newTender();
    await submittable(h, t.id);
    await h.tenders.award(t.id, evidence({ awardedValue: 1_000_000, awardReference: 'LOA-FIRST' }));
    // At-least-once redelivery of the very same award: accepted silently, changes nothing.
    await h.tenders.award(t.id, evidence({ awardedValue: 1_000_000, awardReference: 'LOA-FIRST' }));

    expect((await h.store.get(t.id))!.awardEvidence!.awardedValue).toBe(1_000_000);
    // Exactly one award on the spine — a replay must not re-trigger the deal chain.
    const awarded = (await h.events.list({ tenantId })).filter((e) => e.type === 'tendering.tender.awarded');
    expect(awarded).toHaveLength(1);
  });

  it('ACCEPTANCE 9: a COMPETING award is REFUSED, not silently ignored', async () => {
    // Not overwriting is necessary but not sufficient. A caller who submits a different award must
    // be told it conflicts — returning 200 with the original figures would be a silent contradiction.
    const t = await newTender();
    await submittable(h, t.id);
    await h.tenders.award(t.id, evidence({ awardedValue: 1_000_000, awardReference: 'LOA-FIRST' }));

    await expect(h.tenders.award(t.id, evidence({ awardedValue: 9_999_999, awardReference: 'LOA-SECOND' })))
      .rejects.toThrow(/already been awarded/i);

    const after = (await h.store.get(t.id))!;
    expect(after.awardEvidence!.awardedValue).toBe(1_000_000);   // history stands
    expect(after.awardEvidence!.awardReference).toBe('LOA-FIRST');
    expect((await h.events.list({ tenantId })).filter((e) => e.type === 'tendering.tender.awarded')).toHaveLength(1);
  });

  it('refuses to award a tender that never reached submission — evidence does not excuse the gate', async () => {
    const t = await newTender();
    await expect(h.tenders.award(t.id, evidence())).rejects.toThrow();
    expect((await h.store.get(t.id))!.awardEvidence).toBeNull();
  });

  it('the ungoverned path to won is CLOSED: changeStatus refuses it and writes nothing', async () => {
    const t = await newTender();
    await submittable(h, t.id);
    await expect(h.tenders.changeStatus(t.id, 'won')).rejects.toThrow(/can only be won through the governed award command/i);

    const after = (await h.store.get(t.id))!;
    expect(after.status).toBe('submitted');
    expect(after.awardEvidence).toBeNull();
  });

  it('the awarded event is self-describing, and carries the AWARD not the estimate', async () => {
    const t = await newTender({ value: 800_000 });
    await submittable(h, t.id);
    await h.tenders.award(t.id, evidence({ awardedValue: 1_000_000, awardReference: 'LOA-9' }));

    const e = (await h.events.list({ tenantId })).find((x) => x.type === 'tendering.tender.awarded')!;
    const p = e.payload as Record<string, unknown>;
    expect(p.awardedValue).toBe(1_000_000);
    expect(p.currency).toBe('AED');
    expect(p.awardedAt).toBe(AWARDED_AT);
    expect(p.awardReference).toBe('LOA-9');
    // `value` remains the estimate the contract reactor falls back to — deliberately NOT the award.
    expect(p.value).toBe(800_000);
  });
});
