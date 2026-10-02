import { roundDecimal, subMoney } from '@aura/shared';
import type { TenderAwardEvidence } from './tender-award-evidence';
import type { TenderSubmission } from './submission';

/**
 * VAT-BASIS-01 — what we bid against what the customer awarded, NET WITH NET.
 *
 * The award is recorded excluding VAT (ADR-0021: Award Value excl. VAT). A submission's value is the
 * approved offer's total INCLUDING VAT. Set side by side as stored, a tender won at exactly our price
 * reads as a 4.76% discount conceded at 5% VAT, and one lost at our own price as a competitor
 * undercutting us by the VAT. So the comparison takes the bid's NET — recorded beside the gross
 * since 0404 — and refuses outright when the bid never recorded what its number is, rather than
 * guessing whether it held VAT.
 *
 * Contract Value and every other ADR-0021 measure are untouched: this reads them, it re-derives none.
 */
export type BidVersusAward =
  | { state: 'not-awarded' }
  | { state: 'not-comparable'; reason: string; submissionId: string | null }
  | {
    state: 'compared';
    basis: 'net';
    /** The award's currency. The offer records none of its own, and is read in it — said in `note`. */
    currency: string;
    submissionId: string;
    submittedNet: number;
    awardedNet: number;
    /** awarded − submitted, net. Negative ⇒ the customer awarded less than we bid. */
    difference: number;
    /** `difference` as a share of the submitted net, to 2 decimals. Null when the bid's net is 0. */
    differencePercent: number | null;
    note: string;
  };

/** The bid that stood: the latest submission. A resubmission supersedes the bid before it. */
export function standingSubmission(submissions: readonly TenderSubmission[]): TenderSubmission | null {
  return [...submissions].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0] ?? null;
}

export function bidVersusAward(submission: TenderSubmission | null, award: TenderAwardEvidence | null): BidVersusAward {
  if (!award) return { state: 'not-awarded' };
  if (!submission) {
    return { state: 'not-comparable', reason: 'No submission is recorded for this tender, so there is no bid to compare the award with.', submissionId: null };
  }
  if (submission.valueBasis !== 'gross' || submission.submittedNet === null) {
    return {
      state: 'not-comparable',
      submissionId: submission.id,
      reason: 'The bid\'s value was recorded without saying whether it includes VAT (it was submitted before AURA recorded the basis, or without an approved offer). The award excludes VAT, so the two are not compared — a VAT-sized gap would read as a price difference.',
    };
  }
  const difference = Number(subMoney(award.awardedValue, submission.submittedNet));
  return {
    state: 'compared',
    basis: 'net',
    currency: award.currency,
    submissionId: submission.id,
    submittedNet: submission.submittedNet,
    awardedNet: award.awardedValue,
    difference,
    differencePercent: submission.submittedNet === 0 ? null : roundDecimal((difference / submission.submittedNet) * 100, 2),
    note: `Compared before VAT: the award is recorded excluding VAT, and the bid's net is its approved offer before VAT. The offer records no currency of its own, so it is read in the award's currency (${award.currency}).`,
  };
}
