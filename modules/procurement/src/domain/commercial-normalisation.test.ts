import { describe, expect, it } from 'vitest';
import {
  commercialStatus,
  normaliseRequirementLine,
  quotationCommercialComponents,
  type ComparisonContext,
  type ResolvedFx,
} from './commercial-normalisation';
import type { QuotationLine } from './quotation-line';
import type { QuotationRevision } from './quotation-family';
import type { RevisionProvenance } from './commercial-normalisation';

/**
 * SUP-06 — the facts a comparison is allowed to state, and the ones it must refuse to.
 *
 * Every refusal here is a number somebody could plausibly have computed instead. That is the point:
 * a normalisation that always produces a figure is worse than the wrong scalar it replaced, because
 * it looks considered.
 */

const CONTEXT: ComparisonContext = { baseCurrency: 'AED', comparisonDate: '2026-09-17' };
const GOVERNED: ResolvedFx = {
  status: 'governed', rate: 4.2071, source: 'stored', effectiveDate: '2026-09-01', rateId: 'rate-1',
};
const IDENTITY: ResolvedFx = { status: 'governed', rate: 1, source: 'identity', effectiveDate: null, rateId: null };

/**
 * The commercial terms now come from a REVISION (QC-01), not from a mutable quotation row. That is
 * the whole difference: Rev 1's terms stay exactly as quoted when Rev 2 arrives.
 */
function quote(over: Partial<QuotationRevision> = {}): QuotationRevision {
  return {
    id: 'rev-1', tenantId: 't1', offerId: 'offer-1', revisionNo: 0,
    supplierRevisionRef: null, origin: 'captured',
    receivedAt: '2026-09-01T00:00:00.000Z', quotationDate: '2026-09-01',
    currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5,
    freightAmount: null, freightTerms: null, paymentTerms: null,
    validityDate: '2026-12-31', notes: null, status: 'confirmed',
    supersedesRevisionId: null, sourceAttachmentId: null,
    createdBy: null, createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as QuotationRevision;
}

const PROVENANCE: RevisionProvenance = {
  familyId: 'fam-1', supplierQuotationRef: 'Q-1001',
  offerId: 'offer-1', offerKind: 'base', offerLabel: null,
  revisionId: 'rev-1', revisionNo: 0, supplierRevisionRef: null,
  receivedAt: '2026-09-01T00:00:00.000Z',
};

function line(over: Partial<QuotationLine> = {}): QuotationLine {
  return {
    id: 'ql1', tenantId: 't1', companyId: null, revisionId: 'rev-1', prLineId: 'pr1',
    response: 'quoted', offeredManufacturer: null, offeredModel: null,
    complianceResponse: null, deviations: null, exclusions: null,
    quantity: 12, uom: 'nr', unitPrice: 100, lineDiscount: null,
    leadTimeDays: null, warrantyMonths: null, notes: null,
    createdBy: null, createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as QuotationLine;
}

const normalise = (over: Partial<{
  line: QuotationLine; quote: QuotationRevision; requestedQuantity: number | null; requestedUom: string | null; fx: ResolvedFx;
}> = {}) =>
  normaliseRequirementLine({
    line: over.line ?? line(),
    revision: over.quote ?? quote(),
    supplierName: 'Gulf ELV',
    supplierId: 'sup-1',
    provenance: PROVENANCE,
    requestedQuantity: over.requestedQuantity === undefined ? 12 : over.requestedQuantity,
    requestedUom: over.requestedUom === undefined ? 'nr' : over.requestedUom,
    fx: over.fx ?? IDENTITY,
    context: CONTEXT,
  });

describe('normalising one supplier answer to one requisition line', () => {
  it('carries WHICH revision produced the row, so a sheet can name the offer it came from', () => {
    const result = normalise();
    expect(result.provenance).toMatchObject({
      supplierQuotationRef: 'Q-1001', offerKind: 'base', revisionNo: 0, revisionId: 'rev-1',
    });
    expect(result.notComparableReason).toBeNull();
  });

  it('states the unit price ex-tax, ex-freight, in the base currency, carrying how it got there', () => {
    const result = normalise();
    expect(result.normalisedUnitPrice).toMatchObject({
      status: 'comparable', unitValue: 100, currency: 'AED', comparisonDate: '2026-09-17',
      taxBasis: 'ex-tax', freightBasis: 'excluded',
      fx: { source: 'identity', rate: 1 },
    });
  });

  it('converts a foreign offer at the GOVERNED rate and keeps that rate’s provenance on the value', () => {
    const result = normalise({ quote: quote({ currency: 'EUR' }), fx: GOVERNED });
    expect(result.normalisedUnitPrice).toMatchObject({
      status: 'comparable', unitValue: 420.71, currency: 'AED',
      fx: { source: 'stored', effectiveDate: '2026-09-01', rateId: 'rate-1', rate: 4.2071 },
    });
  });

  it('strips tax from a tax-INCLUSIVE price so it sits on the same basis as an exclusive one', () => {
    const inclusive = normalise({ quote: quote({ taxTreatment: 'inclusive', taxRatePct: 5 }) });
    // 100 inclusive of 5% is 95.24 ex-tax — NOT 100, and not 95.
    expect(inclusive.normalisedUnitPrice).toMatchObject({ status: 'comparable', unitValue: 95.24 });

    // …and an exempt offer has nothing to strip.
    const exempt = normalise({ quote: quote({ taxTreatment: 'exempt', taxRatePct: null }) });
    expect(exempt.normalisedUnitPrice).toMatchObject({ status: 'comparable', unitValue: 100 });
  });

  it('spreads the LINE discount across that line’s own units, because the supplier put it there', () => {
    const result = normalise({ line: line({ quantity: 12, unitPrice: 100, lineDiscount: 120 }) });
    // 1200 − 120 = 1080 over 12 units.
    expect(result.normalisedUnitPrice).toMatchObject({ status: 'comparable', unitValue: 90 });
  });

  describe('refuses rather than producing a plausible number', () => {
    const cases: Array<[string, Parameters<typeof normalise>[0], string, string]> = [
      ['the tax treatment was never stated', { quote: quote({ taxTreatment: null }) }, 'tax_treatment_unknown', 'quotation.taxTreatment'],
      ['tax is inclusive but no rate was given', { quote: quote({ taxTreatment: 'inclusive', taxRatePct: null }) }, 'tax_rate_unknown', 'quotation.taxRatePct'],
      ['the offer names no currency', { quote: quote({ currency: null }) }, 'currency_unknown', 'quotation.currency'],
      ['the supplier did not bid this line', { line: line({ response: 'no_bid', unitPrice: null, quantity: null }) }, 'not_quoted', 'quotationLine.response'],
      ['no unit price was given', { line: line({ unitPrice: null }) }, 'unit_price_unknown', 'quotationLine.unitPrice'],
      ['no quantity was given', { line: line({ quantity: null }) }, 'quantity_unknown', 'quotationLine.quantity'],
    ];

    for (const [why, over, reason, missing] of cases) {
      it(why, () => {
        const result = normalise(over);
        expect(result.normalisedUnitPrice).toMatchObject({ status: 'unknown', reason });
        if (result.normalisedUnitPrice.status !== 'unknown') throw new Error('unreachable');
        expect(result.normalisedUnitPrice.missingInputs).toContain(missing);
        // …and the line total never survives when the unit price did not.
        expect(result.normalisedRequestedLineTotal.status).toBe('unknown');
      });
    }

    it('when no governed rate exists for the pair on the comparison date', () => {
      const result = normalise({ quote: quote({ currency: 'EUR' }), fx: { status: 'unknown', reason: 'no_governed_rate' } });
      expect(result.normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
      if (result.normalisedUnitPrice.status !== 'unknown') throw new Error('unreachable');
      expect(result.normalisedUnitPrice.missingInputs[0]).toContain('EUR->AED');
      expect(result.normalisedUnitPrice.missingInputs[0]).toContain('2026-09-17');
    });
  });

  describe('a differing unit of measure is not comparable', () => {
    it('refuses BOX against NR rather than guessing how many are in a box', () => {
      const result = normalise({ line: line({ uom: 'box' }), requestedUom: 'nr' });
      expect(result.normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'uom_mismatch' });
    });

    it('accepts the same unit written differently, which is spelling and not a conversion', () => {
      const result = normalise({ line: line({ uom: ' NR ' }), requestedUom: 'nr' });
      expect(result.normalisedUnitPrice.status).toBe('comparable');
    });

    it('refuses when either side has no unit at all', () => {
      expect(normalise({ line: line({ uom: null }) }).normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'uom_mismatch' });
      expect(normalise({ requestedUom: null }).normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'uom_mismatch' });
    });
  });

  describe('a differing quantity gives unit economics but NO requisition-line total', () => {
    it('reports the deviation, the coverage, and a known unit price with an UNKNOWN total', () => {
      const result = normalise({ line: line({ quantity: 10, unitPrice: 100 }), requestedQuantity: 12 });

      expect(result).toMatchObject({
        requestedQuantity: 12, quotedQuantity: 10, quantityDeviation: -2, quantityCompliance: 'deviated',
      });
      expect(result.coverageRatio).toBeCloseTo(0.8333, 4);

      // The supplier IS comparable per unit…
      expect(result.normalisedUnitPrice).toMatchObject({ status: 'comparable', unitValue: 100 });
      // …and 12 × 100 = 1,200 is an offer nobody made, so it is not stated.
      expect(result.normalisedRequestedLineTotal).toMatchObject({
        status: 'unknown', reason: 'quoted_quantity_differs',
      });
    });

    it('states the line total ONLY when the supplier offered exactly what was asked for', () => {
      const result = normalise({ line: line({ quantity: 12, unitPrice: 100 }), requestedQuantity: 12 });
      expect(result.quantityCompliance).toBe('exact');
      expect(result.normalisedRequestedLineTotal).toMatchObject({ status: 'comparable', unitValue: 1200 });
    });

    it('offering MORE than was asked for is a deviation too, and gives no total either', () => {
      const result = normalise({ line: line({ quantity: 20 }), requestedQuantity: 12 });
      expect(result).toMatchObject({ quantityDeviation: 8, quantityCompliance: 'deviated' });
      expect(result.normalisedRequestedLineTotal.status).toBe('unknown');
    });
  });
});

/**
 * The separation the whole design turns on: knowing a number and being allowed to act on it are two
 * different facts, and collapsing them into one flag throws away one of them.
 */
describe('comparability is not commercial eligibility', () => {
  it('an EXPIRED offer keeps its known price — expiry is about the offer, not about our knowledge', () => {
    const expired = quote({ validityDate: '2026-09-16' });
    const result = normalise({ quote: expired });

    expect(result.commercialStatus).toBe('expired');
    expect(result.normalisedUnitPrice).toMatchObject({ status: 'comparable', unitValue: 100 });
  });

  it('a live offer says so, and an offer with no validity date says THAT rather than guessing', () => {
    expect(commercialStatus({ validityDate: '2026-09-18' }, CONTEXT)).toBe('live');
    expect(commercialStatus({ validityDate: '2026-09-17' }, CONTEXT)).toBe('live');
    expect(commercialStatus({ validityDate: null }, CONTEXT)).toBe('validity_unknown');
  });

  it('keeps quantity compliance separate from value: known per unit, unknown in total, deviated', () => {
    const result = normalise({ line: line({ quantity: 10 }), requestedQuantity: 12, quote: quote({ validityDate: '2026-09-16' }) });
    expect(result.normalisedUnitPrice.status).toBe('comparable');
    expect(result.normalisedRequestedLineTotal.status).toBe('unknown');
    expect(result.quantityCompliance).toBe('deviated');
    expect(result.commercialStatus).toBe('expired');
  });
});

describe('freight stays a quotation-level component and is never pushed into a line', () => {
  it('converts freight for the offer as a whole, ex-tax, with provenance', () => {
    const components = quotationCommercialComponents(
      quote({ currency: 'EUR', freightAmount: 1000, freightTerms: 'DAP Dubai' }), 'Gulf ELV', GOVERNED, CONTEXT,
    );
    expect(components.freight).toMatchObject({ status: 'comparable', unitValue: 4207.1, currency: 'AED' });
    expect(components.freightTerms).toBe('DAP Dubai');
  });

  it('reports no freight as absent rather than as zero', () => {
    const components = quotationCommercialComponents(quote({ freightAmount: null }), 'Gulf ELV', IDENTITY, CONTEXT);
    expect(components.freight).toBeNull();
  });

  it('refuses to value freight it cannot convert, instead of dropping it silently', () => {
    const components = quotationCommercialComponents(
      quote({ currency: 'EUR', freightAmount: 1000 }), 'Gulf ELV', { status: 'unknown', reason: 'no_governed_rate' }, CONTEXT,
    );
    expect(components.freight).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
  });

  it('never claims a landed total, because the landed components are not all known', () => {
    const components = quotationCommercialComponents(quote({ freightAmount: 500 }), 'Gulf ELV', IDENTITY, CONTEXT);
    expect('landedTotal' in components).toBe(false);
    expect(JSON.stringify(components)).not.toMatch(/landed|all-?in/i);
  });
});

/**
 * The comparison date is an input, never the clock. Two runs of the same comparison on different
 * days must differ ONLY because the caller asked about a different date.
 */
describe('the comparison date is explicit', () => {
  it('travels onto every value computed under it', () => {
    const june = normaliseRequirementLine({
      line: line(), revision: quote(), supplierName: 'Gulf ELV', supplierId: 'sup-1', provenance: PROVENANCE,
      requestedQuantity: 12, requestedUom: 'nr', fx: IDENTITY,
      context: { baseCurrency: 'AED', comparisonDate: '2026-06-30' },
    });
    expect(june.normalisedUnitPrice).toMatchObject({ comparisonDate: '2026-06-30' });
    expect(june.normalisedRequestedLineTotal).toMatchObject({ comparisonDate: '2026-06-30' });
  });

  it('decides validity against the comparison date, not against now', () => {
    const q = quote({ validityDate: '2026-07-31' });
    expect(commercialStatus(q, { baseCurrency: 'AED', comparisonDate: '2026-06-30' })).toBe('live');
    expect(commercialStatus(q, { baseCurrency: 'AED', comparisonDate: '2026-09-17' })).toBe('expired');
  });
});
