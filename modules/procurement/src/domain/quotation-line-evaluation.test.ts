import { describe, it, expect } from 'vitest';
import {
  makeQuotationLineEvaluation, mayEvaluate, technicalEligibility, quantityDeviation, supersede,
  type QuotationLineEvaluation,
} from './quotation-line-evaluation';
import { makeQuotationLine } from './quotation-line';

/**
 * `SUP-01` — the internal technical determination.
 *
 * The rule under test: the company's verdict is a different fact from the supplier's claim, and an
 * offer nobody has evaluated is UNKNOWN rather than acceptable.
 */

const evaluation = (over: Partial<Parameters<typeof makeQuotationLineEvaluation>[0]> = {}): QuotationLineEvaluation =>
  makeQuotationLineEvaluation({
    tenantId: 't-1', quotationLineId: 'ql-1', verdict: 'compliant',
    rationale: 'meets the specified lens and IP rating', decidedBy: 'u-tech',
    ...over,
  });

describe('a verdict is explained, or it is not a verdict', () => {
  it('requires a rationale', () => {
    expect(() => evaluation({ rationale: '' })).toThrow(/requires a rationale/);
    expect(() => evaluation({ rationale: '   ' })).toThrow(/requires a rationale/);
  });

  it('records who decided it', () => {
    expect(evaluation().decidedBy).toBe('u-tech');
    expect(() => evaluation({ decidedBy: '' })).toThrow(/decidedBy is required/);
  });
});

describe('an offer nobody has evaluated is UNKNOWN', () => {
  it('reads unknown with no evaluation — not eligible, and not cheap', () => {
    expect(technicalEligibility(null)).toBe('unknown');
  });

  it('does NOT fall back to the supplier’s own compliance claim', () => {
    // The supplier says `comply`. Nobody internal has looked. The answer is still unknown.
    const line = makeQuotationLine({
      tenantId: 't-1', quotationId: 'q-1', prLineId: 'prl-1',
      quantity: 12, unitPrice: 430, complianceResponse: 'comply',
    });
    expect(line.complianceResponse).toBe('comply');
    expect(technicalEligibility(null)).toBe('unknown');
  });

  it('reads unknown again once a verdict has been superseded', () => {
    // The old decision no longer speaks, and the new one is a separate record.
    expect(technicalEligibility(supersede(evaluation(), 'eval-2'))).toBe('unknown');
  });
});

describe('a decided offer is eligible or it is not', () => {
  it('treats compliant and compliant-with-deviation as eligible', () => {
    expect(technicalEligibility(evaluation({ verdict: 'compliant' }))).toBe('eligible');
    expect(technicalEligibility(evaluation({ verdict: 'compliant_with_deviation' }))).toBe('eligible');
  });

  it('treats non-compliant as not eligible', () => {
    expect(technicalEligibility(evaluation({ verdict: 'non_compliant' }))).toBe('not_eligible');
  });
});

describe('a verdict is amended by supersession, never overwritten', () => {
  it('requires a reason for the amendment', () => {
    expect(() => evaluation({ supersedesId: 'eval-1' })).toThrow(/requires a reason/);
  });

  it('keeps the replaced decision on the record, marked rather than deleted', () => {
    const first = evaluation({ verdict: 'non_compliant', rationale: 'lens does not meet spec' });
    const replaced = supersede(first, 'eval-2');
    expect(replaced.supersededAt).not.toBeNull();
    expect(replaced.supersededBy).toBe('eval-2');
    // The original verdict and its reasoning survive intact.
    expect(replaced.verdict).toBe('non_compliant');
    expect(replaced.rationale).toBe('lens does not meet spec');
  });
});

describe('there is nothing to evaluate about a decline', () => {
  it('refuses to evaluate a no_bid line', () => {
    const declined = makeQuotationLine({ tenantId: 't-1', quotationId: 'q-1', prLineId: 'prl-1', response: 'no_bid' });
    expect(mayEvaluate(declined)).toMatchObject({ allowed: false });
    expect(mayEvaluate(declined).reason).toMatch(/did not offer anything/);
  });

  it('allows evaluating an actual offer', () => {
    const offered = makeQuotationLine({ tenantId: 't-1', quotationId: 'q-1', prLineId: 'prl-1', quantity: 12, unitPrice: 430 });
    expect(mayEvaluate(offered)).toEqual({ allowed: true });
  });
});

describe('a differing quantity is a deviation, surfaced not decided', () => {
  it('reports a shortfall against what was asked for', () => {
    expect(quantityDeviation(12, 10)).toEqual({ deviates: true, requested: 12, offered: 10, difference: -2 });
  });

  it('reports an over-supply too — more is also not what was asked for', () => {
    expect(quantityDeviation(12, 15)).toEqual({ deviates: true, requested: 12, offered: 15, difference: 3 });
  });

  it('reports no deviation when the quantity matches', () => {
    expect(quantityDeviation(12, 12)).toMatchObject({ deviates: false, difference: 0 });
  });

  it('does not claim "no difference" when a side is unknown', () => {
    // An unmeasurable difference is not a measured zero.
    expect(quantityDeviation(null, 10)).toMatchObject({ deviates: false, difference: null });
    expect(quantityDeviation(12, null)).toMatchObject({ deviates: false, difference: null });
  });

  it('decides nothing by itself — a deviation is an input to the verdict', () => {
    // 10 against 12 deviates, and whether that is acceptable is the evaluator's judgement. The
    // deviation does not make the offer ineligible on its own.
    expect(quantityDeviation(12, 10).deviates).toBe(true);
    expect(technicalEligibility(evaluation({ verdict: 'compliant_with_deviation' }))).toBe('eligible');
  });
});
