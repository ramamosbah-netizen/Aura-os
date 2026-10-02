import type { CSSProperties } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

export interface BidVersusAwardView {
  submission: {
    id: string;
    submittedAt: string;
    reference: string | null;
    submittedValue: number;
    valueBasis: 'gross' | 'unstated';
    submittedNet: number | null;
    submittedVat: number | null;
  } | null;
  award: { awardedValue: number; currency: string; awardedAt: string; awardReference: string | null } | null;
  comparison:
    | { state: 'not-awarded' }
    | { state: 'not-comparable'; reason: string }
    | { state: 'compared'; currency: string; submittedNet: number; awardedNet: number; difference: number; differencePercent: number | null; note: string };
}

const amount = (n: number): string => new Intl.NumberFormat(DISPLAY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const day = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { dateStyle: 'medium', timeZone: DISPLAY_TIME_ZONE });

/**
 * VAT-BASIS-01 — what we bid, what the customer awarded, and the difference BEFORE VAT.
 *
 * The bid's number is the approved offer's total including VAT; the award is recorded excluding it.
 * This shows both as recorded, with the bid's parts, and compares the bid's net with the award — or
 * says why it does not, when the bid never recorded whether its number held VAT.
 */
export default function TenderBidAward({ view }: { view: BidVersusAwardView }) {
  const { submission, award, comparison } = view;
  if (!submission && !award) return null;
  return (
    <section style={st.wrap} data-testid="tender-bid-award" aria-label="Bid and award">
      {submission && (
        <div data-testid="tender-bid">
          <span style={st.eyebrow}>Bid</span>{' '}
          submitted {day(submission.submittedAt)}{submission.reference ? ` (ref ${submission.reference})` : ''}:{' '}
          {submission.valueBasis === 'gross' && submission.submittedNet !== null && submission.submittedVat !== null ? (
            <>
              <strong>{amount(submission.submittedValue)}</strong> including VAT — {amount(submission.submittedNet)} before VAT
              + {amount(submission.submittedVat)} VAT
            </>
          ) : (
            <>
              <strong>{amount(submission.submittedValue)}</strong> — whether this includes VAT was not recorded
            </>
          )}
        </div>
      )}
      {award && (
        <div data-testid="tender-award">
          <span style={st.eyebrow}>Awarded</span>{' '}
          {award.currency} <strong>{amount(award.awardedValue)}</strong> excluding VAT, on {day(award.awardedAt)}
          {award.awardReference ? ` (ref ${award.awardReference})` : ''}
        </div>
      )}
      {comparison.state === 'compared' && (
        <>
          <div data-testid="tender-bid-award-difference" style={st.result}>
            Against the bid, before VAT:{' '}
            {comparison.difference === 0
              ? <strong>no difference — awarded at the price we bid</strong>
              : (
                <strong style={{ color: comparison.difference < 0 ? 'var(--bad)' : 'var(--good)' }}>
                  {comparison.currency} {amount(Math.abs(comparison.difference))}
                  {comparison.differencePercent !== null ? ` (${Math.abs(comparison.differencePercent)}%)` : ''}
                  {comparison.difference < 0 ? ' below' : ' above'} our bid of {amount(comparison.submittedNet)}
                </strong>
              )}
          </div>
          <p style={st.note}>{comparison.note}</p>
        </>
      )}
      {comparison.state === 'not-comparable' && (
        <p style={st.note} data-testid="tender-bid-award-not-compared">{comparison.reason}</p>
      )}
    </section>
  );
}

const st = {
  wrap: { margin: '0 0 12px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', fontSize: 13, lineHeight: 1.6, display: 'grid', gap: 2 } as CSSProperties,
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent)' } as CSSProperties,
  result: { marginTop: 4 } as CSSProperties,
  note: { margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' } as CSSProperties,
};
