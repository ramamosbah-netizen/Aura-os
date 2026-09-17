import { describe, expect, it } from 'vitest';
import {
  makeSourcingRecommendation,
  offerRecommendability,
  reasonRequired,
  recommendationStaleness,
  selectionCoverage,
  wholeOfferTotal,
} from './sourcing-recommendation';
import type { NormalisedCommercialValue } from './commercial-normalisation';

/**
 * SUP-13 — what may be recommended, and what must be explained.
 *
 * The recurring shape: AURA refuses to turn an absence into a number or a silence into permission.
 * An unevaluated line is not acceptable-by-default, an unquantified freight charge is not zero, and
 * a newer revision does not become the recommendation nobody read.
 */

const comparable = (unitValue: number): NormalisedCommercialValue => ({
  status: 'comparable', unitValue, currency: 'AED', comparisonDate: '2026-09-17',
  taxBasis: 'ex-tax', freightBasis: 'excluded',
  fx: { source: 'identity', effectiveDate: null, rateId: null, rate: 1 },
});
const unknown = (reason: NormalisedCommercialValue extends { status: 'unknown' } ? never : 'quoted_quantity_differs' | 'no_governed_rate'): NormalisedCommercialValue =>
  ({ status: 'unknown', reason, missingInputs: [] });

const BASIS = { currency: 'AED', comparisonDate: '2026-09-17' };

describe('the whole-offer total', () => {
  it('adds quotation-level freight at the level the supplier quoted it', () => {
    // The allocation we refused to invent across lines is simply unnecessary here.
    const total = wholeOfferTotal({ lineTotals: [comparable(30_000), comparable(10_000)], freight: comparable(1_500), ...BASIS });
    expect(total).toMatchObject({ status: 'known', value: 41_500, includesFreight: true, taxBasis: 'ex-tax' });
  });

  it('distinguishes NO freight quoted from freight that cannot be valued', () => {
    // Nothing quoted: the offer carries no freight charge, and the total is known.
    expect(wholeOfferTotal({ lineTotals: [comparable(40_000)], freight: null, ...BASIS }))
      .toMatchObject({ status: 'known', value: 40_000, includesFreight: false });

    // Quoted as "to be advised": the total is NOT known, and it is certainly not 40,000.
    const vague = wholeOfferTotal({ lineTotals: [comparable(40_000)], freight: unknown('no_governed_rate'), ...BASIS });
    expect(vague).toMatchObject({ status: 'unknown', reason: 'freight_not_quantified' });
    if (vague.status !== 'unknown') throw new Error('unreachable');
    expect(vague.detail).toMatch(/NOT zero freight/);
  });

  it('is UNKNOWN when any line total is — the partial-offer case', () => {
    // 10 offered against 12 requested: the requisition-line total is unknown, so the offer cannot be
    // priced for the whole requirement. It may still be split-awarded for part of it.
    const total = wholeOfferTotal({
      lineTotals: [comparable(30_000), unknown('quoted_quantity_differs')], freight: comparable(1_500), ...BASIS,
    });
    expect(total).toMatchObject({ status: 'unknown', reason: 'line_total_unknown' });
  });

  it('refuses an offer that prices nothing, rather than calling it zero', () => {
    expect(wholeOfferTotal({ lineTotals: [], freight: null, ...BASIS }))
      .toMatchObject({ status: 'unknown', reason: 'line_total_unknown' });
  });
});

describe('may this offer be recommended?', () => {
  const base = {
    hasEffectiveRevision: true,
    technicalByLine: { 'pr-1': 'eligible' as const, 'pr-2': 'eligible' as const },
    coveredPrLineIds: ['pr-1', 'pr-2'],
    wholeTotal: { status: 'known', value: 41_500, currency: 'AED', comparisonDate: '2026-09-17', taxBasis: 'ex-tax' as const, includesFreight: true } as const,
    commercialStatus: 'live' as const,
  };

  it('yes, when the offer is current, compliant, priced and live', () => {
    expect(offerRecommendability(base)).toMatchObject({ recommendable: true, reasons: [] });
  });

  it('accepts compliant-with-deviation, because a deviation was judged and accepted', () => {
    // SUP-01 collapses compliant and compliant_with_deviation to `eligible`: both are decisions.
    expect(offerRecommendability({ ...base, technicalByLine: { 'pr-1': 'eligible', 'pr-2': 'eligible' } }).recommendable).toBe(true);
  });

  it('NO when any covered line has no technical verdict — unknown is not permission', () => {
    const verdict = offerRecommendability({ ...base, technicalByLine: { 'pr-1': 'eligible', 'pr-2': 'unknown' } });
    expect(verdict.recommendable).toBe(false);
    expect(verdict.reasons[0]).toMatchObject({ reason: 'technical_verdict_missing' });
    expect(verdict.reasons[0].detail).toMatch(/until the Technical Manager decides/);
  });

  it('NO when a covered line was judged not compliant', () => {
    const verdict = offerRecommendability({ ...base, technicalByLine: { 'pr-1': 'eligible', 'pr-2': 'not_eligible' } });
    expect(verdict.reasons.map((r) => r.reason)).toContain('technically_not_compliant');
  });

  it('NO when the supplier has no current offer at all, and says only that', () => {
    const verdict = offerRecommendability({ ...base, hasEffectiveRevision: false });
    expect(verdict).toMatchObject({ recommendable: false });
    // One reason, not five: nothing else can be judged without an offer.
    expect(verdict.reasons).toHaveLength(1);
    expect(verdict.reasons[0].reason).toBe('no_effective_revision');
  });

  it('NO when the whole-requirement cost is not known', () => {
    const verdict = offerRecommendability({
      ...base,
      wholeTotal: { status: 'unknown', reason: 'line_total_unknown', detail: 'a line is unknown' },
    });
    expect(verdict.reasons.map((r) => r.reason)).toContain('commercial_total_unknown');
  });

  it('NO when the offer has EXPIRED — the price is known, the permission has lapsed', () => {
    const verdict = offerRecommendability({ ...base, commercialStatus: 'expired' });
    expect(verdict.recommendable).toBe(false);
    const expired = verdict.reasons.find((r) => r.reason === 'offer_expired');
    expect(expired?.detail).toMatch(/its price is known/);
    expect(expired?.detail).toMatch(/extends it or sends a new revision/);
  });

  it('does not block on a missing validity date, which is unknown rather than lapsed', () => {
    expect(offerRecommendability({ ...base, commercialStatus: 'validity_unknown' }).recommendable).toBe(true);
  });

  it('a partial offer may still be recommended for the lines it DOES cover', () => {
    // The whole-requirement total was unknown; this supplier is recommended for pr-1 only, priced.
    const verdict = offerRecommendability({
      hasEffectiveRevision: true,
      technicalByLine: { 'pr-1': 'eligible' },
      coveredPrLineIds: ['pr-1'],
      wholeTotal: { status: 'known', value: 30_000, currency: 'AED', comparisonDate: '2026-09-17', taxBasis: 'ex-tax', includesFreight: false },
      commercialStatus: 'live',
    });
    expect(verdict.recommendable).toBe(true);
  });
});

describe('the scope must be whole and unambiguous', () => {
  it('accepts one supplier covering every requirement', () => {
    expect(selectionCoverage(['pr-1', 'pr-2'], [{ coveredPrLineIds: ['pr-1', 'pr-2'] }]))
      .toMatchObject({ complete: true, uncovered: [], duplicated: [] });
  });

  it('accepts a split that divides the requirement exactly', () => {
    expect(selectionCoverage(['pr-1', 'pr-2', 'pr-3'], [
      { coveredPrLineIds: ['pr-1', 'pr-2'] }, { coveredPrLineIds: ['pr-3'] },
    ])).toMatchObject({ complete: true });
  });

  it('refuses an uncovered line — part of the requirement would simply vanish', () => {
    expect(selectionCoverage(['pr-1', 'pr-2'], [{ coveredPrLineIds: ['pr-1'] }]))
      .toMatchObject({ complete: false, uncovered: ['pr-2'] });
  });

  it('refuses a line covered twice — two suppliers asked for the same thing', () => {
    expect(selectionCoverage(['pr-1'], [{ coveredPrLineIds: ['pr-1'] }, { coveredPrLineIds: ['pr-1'] }]))
      .toMatchObject({ complete: false, duplicated: ['pr-1'] });
  });
});

describe('when a reason is required', () => {
  it('always, for a split award', () => {
    expect(reasonRequired({ mode: 'split_award', chosenTotal: 100, lowestAvailableTotal: 100 })).toBe(true);
  });

  it('when the chosen offer is not the lowest governed total', () => {
    expect(reasonRequired({ mode: 'single_supplier', chosenTotal: 41_500, lowestAvailableTotal: 39_000 })).toBe(true);
    expect(reasonRequired({ mode: 'single_supplier', chosenTotal: 39_000, lowestAvailableTotal: 39_000 })).toBe(false);
  });

  it('not when there is nothing to compare against', () => {
    expect(reasonRequired({ mode: 'single_supplier', chosenTotal: 41_500, lowestAvailableTotal: null })).toBe(false);
  });
});

/**
 * The property that stops a decision drifting: a recommendation names the revision it was made on,
 * and a newer one makes it stale rather than silently becoming its subject.
 */
describe('staleness', () => {
  const selection = { offerId: 'offer-1', revisionId: 'rev-2', supplierName: 'Gulf ELV' };

  it('is fresh while the recommended revision is still the current offer', () => {
    expect(recommendationStaleness([selection], { 'offer-1': { revisionId: 'rev-2' } }))
      .toMatchObject({ stale: false, affected: [] });
  });

  it('goes STALE when the supplier sends a newer revision — it does not follow to Rev 3', () => {
    const staleness = recommendationStaleness([selection], { 'offer-1': { revisionId: 'rev-3' } });
    expect(staleness.stale).toBe(true);
    expect(staleness.affected[0]).toMatchObject({ reason: 'revision_superseded', supplierName: 'Gulf ELV' });
    expect(staleness.affected[0].detail).toMatch(/made on a different offer and must be reviewed/);
  });

  it('goes STALE when the recommended revision was withdrawn and nothing replaced it', () => {
    const staleness = recommendationStaleness([selection], { 'offer-1': null });
    expect(staleness.affected[0]).toMatchObject({ reason: 'offer_has_no_current_revision' });
  });
});

describe('the recommendation record', () => {
  it('records the comparison it was made under, and starts as a draft', () => {
    const reco = makeSourcingRecommendation({
      tenantId: 't1', rfqId: 'rfq-1', comparisonDate: '2026-09-17', comparisonCurrency: 'AED',
    });
    expect(reco).toMatchObject({
      status: 'draft', mode: 'single_supplier', comparisonDate: '2026-09-17', comparisonCurrency: 'AED',
      submittedAt: null, decidedAt: null,
    });
  });

  it('refuses a recommendation that does not say what comparison it was made on', () => {
    expect(() => makeSourcingRecommendation({
      tenantId: 't1', rfqId: 'rfq-1', comparisonDate: 'whenever', comparisonCurrency: 'AED',
    })).toThrow(/comparison date/);
  });
});
