import { describe, expect, it } from 'vitest';
import { bidVersusAward, standingSubmission } from './bid-versus-award';
import { makeTenderSubmission } from './submission';
import { makeTenderAwardEvidence } from './tender-award-evidence';

// The measured case: ALD-376214 went out at 123,694.20 = 117,804.00 + VAT 5,890.20.
const OFFER = { net: 117_804, vat: 5_890.2, gross: 123_694.2 };
const submitted = (over: Parameters<typeof makeTenderSubmission>[0] = { tenantId: 't', tenderId: 'x', offer: OFFER }) =>
  makeTenderSubmission(over);
const award = (awardedValue: number, currency = 'AED') =>
  makeTenderAwardEvidence({ awardedValue, currency, awardedAt: '2026-10-01T08:00:00Z', capturedBy: 'u-qs' });

describe('VAT-BASIS-01 — a submission says what its number is', () => {
  it('an approved offer goes out as gross, with its net and VAT recorded beside it', () => {
    const s = submitted();
    expect(s).toMatchObject({ submittedValue: 123_694.2, valueBasis: 'gross', submittedNet: 117_804, submittedVat: 5_890.2 });
  });

  it('the offer\'s total IS the value — a separately supplied number cannot override it', () => {
    const s = makeTenderSubmission({ tenantId: 't', tenderId: 'x', submittedValue: 1, offer: OFFER });
    expect(s.submittedValue).toBe(123_694.2);
  });

  it('a bid with no approved offer is unstated, and claims no parts', () => {
    const s = makeTenderSubmission({ tenantId: 't', tenderId: 'x', submittedValue: 50_000 });
    expect(s).toMatchObject({ submittedValue: 50_000, valueBasis: 'unstated', submittedNet: null, submittedVat: null });
  });

  it('refuses parts that do not add up to the whole', () => {
    expect(() => makeTenderSubmission({ tenantId: 't', tenderId: 'x', offer: { net: 100, vat: 5, gross: 106 } }))
      .toThrow('requires its net (100) and VAT (5) to add up to its total (106)');
  });
});

describe('VAT-BASIS-01 — bid against award, net with net', () => {
  it('a tender awarded at exactly the submitted price differs by zero — not by the VAT', () => {
    const r = bidVersusAward(submitted(), award(117_804));
    expect(r).toMatchObject({ state: 'compared', basis: 'net', currency: 'AED', submittedNet: 117_804, awardedNet: 117_804, difference: 0, differencePercent: 0 });
    // What a gross-against-net reading would have reported: a 4.76% discount conceded.
    expect(((117_804 - 123_694.2) / 123_694.2) * 100).toBeCloseTo(-4.76, 2);
  });

  it('a real difference is reported as one, signed and as a share of our net', () => {
    const r = bidVersusAward(submitted(), award(112_000));
    expect(r).toMatchObject({ state: 'compared', difference: -5_804, differencePercent: -4.93 });
  });

  it('says the offer carries no currency and is read in the award\'s', () => {
    const r = bidVersusAward(submitted(), award(117_804, 'usd'));
    expect(r.state === 'compared' && r.note).toContain('read in the award\'s currency (USD)');
  });

  it('refuses to compare a bid whose basis was never recorded', () => {
    const r = bidVersusAward(makeTenderSubmission({ tenantId: 't', tenderId: 'x', submittedValue: 123_694.2 }), award(117_804));
    expect(r.state).toBe('not-comparable');
    expect(r.state === 'not-comparable' && r.reason).toContain('without saying whether it includes VAT');
  });

  it('no award, nothing to compare; no submission, nothing to compare it with', () => {
    expect(bidVersusAward(submitted(), null)).toEqual({ state: 'not-awarded' });
    expect(bidVersusAward(null, award(1))).toMatchObject({ state: 'not-comparable', submissionId: null });
  });

  it('the bid that stood is the latest submission', () => {
    const first = submitted({ tenantId: 't', tenderId: 'x', submittedAt: '2026-09-01T00:00:00Z', submittedValue: 10 });
    const resubmitted = submitted({ tenantId: 't', tenderId: 'x', submittedAt: '2026-09-20T00:00:00Z', offer: OFFER });
    expect(standingSubmission([first, resubmitted])?.id).toBe(resubmitted.id);
    expect(standingSubmission([])).toBeNull();
  });
});
