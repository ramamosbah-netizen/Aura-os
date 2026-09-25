import type { CSSProperties } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

export interface TenderCommercialBasisView {
  kind: 'AT_AWARD' | 'POST_AWARD_LINKED';
  baselineId: string;
  quotationId: string;
  value: number;
  establishedAt: string;
}

const money = (n: number): string => new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 2 }).format(n);
const when = (iso: string): string => new Date(iso).toLocaleString(DISPLAY_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE });

/**
 * WHAT THE AWARD WAS WON ON — the one immutable revision it points to.
 *
 * The award pins its commercial basis at the moment of award (ADR-0021): the approved baseline of a
 * named revision of a named offer. That baseline is a snapshot — lines, internal pricing and the
 * estimate as it was approved — and nothing later changes it, not a revision, not a re-priced sheet.
 * The tender never said which revision that was; this says it, and links to it.
 */
export default function TenderAwardBasis({ basis, quotation, baseline }: {
  basis: TenderCommercialBasisView;
  quotation: { quoteNumber: string; revision: number } | null;
  baseline: { revision: number; lockedBy: string | null; lockedAt: string } | null;
}) {
  const label = quotation ? `${quotation.quoteNumber} Rev ${baseline?.revision ?? quotation.revision}` : 'the approved offer';
  return (
    <div style={st.wrap} data-testid="tender-award-basis">
      <span style={st.eyebrow}>Awarded on</span>{' '}
      <a href={`/crm/quotations/${basis.quotationId}`} style={st.link}>{label}</a>
      {baseline && <> — approved by {baseline.lockedBy ?? 'unknown'} on {when(baseline.lockedAt)}</>}
      {' '}· contract value {money(basis.value)}
      {' '}· {basis.kind === 'AT_AWARD' ? 'pinned at the award' : 'linked after the award, when the offer was approved'} ({when(basis.establishedAt)})
    </div>
  );
}

const st = {
  wrap: { margin: '0 0 12px', padding: '10px 14px', border: '1px solid var(--good-soft, var(--border))', borderRadius: 10, background: 'var(--panel)', fontSize: 13, lineHeight: 1.5 } as CSSProperties,
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--good)' } as CSSProperties,
  link: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' } as CSSProperties,
};
