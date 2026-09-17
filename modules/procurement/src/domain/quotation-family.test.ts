import { describe, expect, it } from 'vitest';
import {
  confirmRevision,
  effectiveRevision,
  makeQuotationFamily,
  makeQuotationOffer,
  makeQuotationRevision,
  mayEditRevision,
  nextRevisionNo,
  noEffectiveRevisionReason,
  retireRevision,
  revisionChanges,
  type QuotationRevision,
} from './quotation-family';

/**
 * QC-01 — the supplier's commercial history survives, and exactly one revision is effective.
 *
 * The case throughout is the one that defined the model: Rev 0 at AED 100, Rev 1 at AED 92, Rev 2 at
 * AED 95 with free freight. Under the old single mutable row, Rev 0 and Rev 1 simply ceased to exist.
 */

const OFFER = 'offer-1';
const rev = (over: Partial<QuotationRevision> = {}): QuotationRevision =>
  ({ ...makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0 }), ...over });

describe('the quotation family', () => {
  it('names its supplier and the RFQ it answers, and keeps the supplier’s own reference', () => {
    const family = makeQuotationFamily({ tenantId: 't1', rfqId: 'rfq-1', supplierName: '  Gulf ELV  ', supplierQuotationRef: ' Q-1001 ' });
    expect(family).toMatchObject({ supplierName: 'Gulf ELV', supplierQuotationRef: 'Q-1001', supplierId: null });
  });

  it('refuses a quotation from nobody, or one answering nothing', () => {
    expect(() => makeQuotationFamily({ tenantId: 't1', rfqId: 'rfq-1', supplierName: '  ' })).toThrow(/name the supplier/);
    expect(() => makeQuotationFamily({ tenantId: 't1', rfqId: '', supplierName: 'Gulf ELV' })).toThrow(/answer an RFQ/);
  });
});

describe('an alternative is an OFFER, never a revision', () => {
  it('requires an alternative to say what is being offered instead', () => {
    expect(() => makeQuotationOffer({ tenantId: 't1', familyId: 'f1', kind: 'alternative' }))
      .toThrow(/must say what is being offered instead/);
    const bosch = makeQuotationOffer({ tenantId: 't1', familyId: 'f1', kind: 'alternative', label: ' Bosch equivalent ' });
    expect(bosch).toMatchObject({ kind: 'alternative', label: 'Bosch equivalent' });
  });

  it('asks a base offer for no label, because it is the thing that was asked for', () => {
    expect(makeQuotationOffer({ tenantId: 't1', familyId: 'f1' })).toMatchObject({ kind: 'base', label: null });
  });
});

describe('a revision is an immutable commercial snapshot', () => {
  it('refuses a tax-inclusive price with no rate, at capture rather than at comparison', () => {
    expect(() => makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0, taxTreatment: 'inclusive' }))
      .toThrow(/must state its tax rate/);
    // …and accepts it once the rate is there.
    expect(makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0, taxTreatment: 'inclusive', taxRatePct: 5 }))
      .toMatchObject({ taxTreatment: 'inclusive', taxRatePct: 5 });
  });

  it('leaves every unstated commercial fact as UNKNOWN rather than defaulting it', () => {
    const r = makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0 });
    expect(r).toMatchObject({ currency: null, taxTreatment: null, taxRatePct: null, freightAmount: null, validityDate: null });
  });

  it('marks a migrated revision as AURA’s own, so it cannot read as the supplier’s Rev 0', () => {
    const migrated = makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0, origin: 'legacy_migration' });
    expect(migrated).toMatchObject({ origin: 'legacy_migration', supplierRevisionRef: null });
    expect(makeQuotationRevision({ tenantId: 't1', offerId: OFFER, revisionNo: 0 }).origin).toBe('captured');
  });

  it('may be edited only while it is a draft', () => {
    expect(mayEditRevision(rev({ status: 'draft' }))).toBe(true);
    for (const status of ['received', 'confirmed', 'superseded', 'withdrawn', 'rejected'] as const) {
      expect(mayEditRevision(rev({ status }))).toMatch(/cannot be changed .* new revision/);
    }
  });

  it('numbers revisions from zero and never reuses a number', () => {
    expect(nextRevisionNo([])).toBe(0);
    expect(nextRevisionNo([rev({ revisionNo: 0 }), rev({ revisionNo: 1 })])).toBe(2);
    // A withdrawn revision still consumed its number.
    expect(nextRevisionNo([rev({ revisionNo: 0 }), rev({ revisionNo: 1, status: 'withdrawn' })])).toBe(2);
  });
});

describe('confirming a revision demotes the one before it, in that order', () => {
  it('returns the supersede FIRST and the promote second, for one transaction', () => {
    const rev1 = rev({ id: 'r1', revisionNo: 1, status: 'confirmed' });
    const rev2 = rev({ id: 'r2', revisionNo: 2, status: 'received' });

    const { demote, promote } = confirmRevision(rev2, rev1);
    expect(demote).toMatchObject({ id: 'r1', status: 'superseded' });
    expect(promote).toMatchObject({ id: 'r2', status: 'confirmed', supersedesRevisionId: 'r1' });
  });

  it('confirms the first revision of an offer with nothing to demote', () => {
    const { demote, promote } = confirmRevision(rev({ id: 'r0', status: 'received' }), null);
    expect(demote).toBeNull();
    expect(promote).toMatchObject({ status: 'confirmed', supersedesRevisionId: null });
  });

  it('refuses to confirm something already retired, or to supersede another offer’s revision', () => {
    expect(() => confirmRevision(rev({ status: 'withdrawn' }), null)).toThrow(/only a draft or received revision/);
    expect(() => confirmRevision(rev({ status: 'received' }), rev({ id: 'x', offerId: 'other', status: 'confirmed' })))
      .toThrow(/same offer/);
  });
});

describe('the commercially effective revision', () => {
  it('is the confirmed one, and the superseded ones remain readable', () => {
    const history = [
      rev({ id: 'r0', revisionNo: 0, status: 'superseded' }),
      rev({ id: 'r1', revisionNo: 1, status: 'superseded' }),
      rev({ id: 'r2', revisionNo: 2, status: 'confirmed' }),
    ];
    expect(effectiveRevision(history)?.id).toBe('r2');
    expect(history.filter((r) => r.status === 'superseded')).toHaveLength(2);
  });

  it('is NULL when the latest was withdrawn — an earlier revision is never reinstated', () => {
    const history = [
      rev({ id: 'r0', revisionNo: 0, status: 'superseded' }),
      rev({ id: 'r1', revisionNo: 1, status: 'superseded' }),
      rev({ id: 'r2', revisionNo: 2, status: 'withdrawn' }),
    ];
    expect(effectiveRevision(history)).toBeNull();
    expect(noEffectiveRevisionReason(history)).toMatch(/withdrawn by the supplier and no earlier revision is reinstated/);
  });

  it('is NULL for a quotation captured but never confirmed, and says which', () => {
    expect(noEffectiveRevisionReason([])).toMatch(/no revision has been captured/);
    expect(noEffectiveRevisionReason([rev({ revisionNo: 0, status: 'draft' })])).toMatch(/still a draft/);
    expect(noEffectiveRevisionReason([rev({ revisionNo: 0, status: 'received' })])).toMatch(/received but not confirmed/);
    expect(noEffectiveRevisionReason([rev({ revisionNo: 3, status: 'rejected' })])).toMatch(/rejected/);
  });

  it('retiring the effective revision leaves the offer with none, rather than falling back', () => {
    const confirmed = rev({ id: 'r2', revisionNo: 2, status: 'confirmed' });
    const withdrawn = retireRevision(confirmed, 'withdrawn');
    expect(effectiveRevision([rev({ revisionNo: 1, status: 'superseded' }), withdrawn])).toBeNull();
    expect(() => retireRevision(withdrawn, 'rejected')).toThrow(/already withdrawn/);
  });
});

/**
 * The commercial history a buyer actually reads. A supplier who moves from 92 with AED 500 freight
 * to 95 with free freight has restructured the offer, and a buyer who sees only the unit price rise
 * has read half of it.
 */
describe('what changed between revisions', () => {
  it('reports the freight restructure beside the price move', () => {
    const rev1 = rev({ revisionNo: 1, freightAmount: 500, freightTerms: 'EXW', currency: 'AED' });
    const rev2 = rev({ revisionNo: 2, freightAmount: 0, freightTerms: 'DAP Dubai', currency: 'AED' });

    const changes = revisionChanges(rev1, rev2);
    expect(changes).toContainEqual({ field: 'freight amount', from: 500, to: 0 });
    expect(changes).toContainEqual({ field: 'freight terms', from: 'EXW', to: 'DAP Dubai' });
    // Unchanged facts are not reported as changes.
    expect(changes.find((c) => c.field === 'currency')).toBeUndefined();
  });

  it('reports nothing when the commercial header did not move', () => {
    const a = rev({ currency: 'AED', freightAmount: 500 });
    expect(revisionChanges(a, rev({ currency: 'AED', freightAmount: 500 }))).toHaveLength(0);
  });
});
