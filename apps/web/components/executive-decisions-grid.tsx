import type { CSSProperties } from 'react';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

/**
 * The executive decision set (F-10), one tile per governed decision.
 *
 * Every tile says WHEN it was read, WHAT it counted (and what it left out, and why), WHERE it came
 * from, and opens the exact records behind it. A decision that cannot be measured says so, with the
 * reason, in the place its number would have been. Pure render — used by the /executive page and by
 * the Command Center's CEO perspective, so the two can never show different figures.
 */
export interface DecisionFigure { label: string; value: number; unit: 'currency' | 'count' | 'percent' | 'days' }
export interface DecisionSummary {
  id: string;
  capability: string;
  title: string;
  question: string;
  state: 'measured' | 'unavailable';
  figures: DecisionFigure[];
  population: { counted: number; of: string; excluded: Array<{ count: number; reason: string }> };
  source: string;
  basis: string | null;
  unavailableReason: string | null;
  asOf: string;
  recordCount: number;
}
export interface ExecutiveDecisionsView { asOf: string; currency: string; decisions: DecisionSummary[] }

export function asOfLabel(iso: string): string {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });
}

/** What a drilldown row's value measures; a row may differ from its neighbours (money beside days). */
export type RecordUnit = DecisionFigure['unit'] | 'quantity';

export function measureText(value: number, unit: RecordUnit, currency: string): string {
  if (unit === 'currency') return `${currency} ${value.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 0 })}`;
  if (unit === 'percent') return `${value}%`;
  if (unit === 'days') return `${value.toLocaleString(DISPLAY_LOCALE)} ${Math.abs(value) === 1 ? 'day' : 'days'}`;
  return value.toLocaleString(DISPLAY_LOCALE);
}

export function figureText(f: DecisionFigure, currency: string): string {
  return measureText(f.value, f.unit, currency);
}

export default function ExecutiveDecisionsGrid({ view }: { view: ExecutiveDecisionsView }) {
  return (
    <div>
      <p style={s.readAt} data-testid="executive-as-of">
        Read live from the system of record at {asOfLabel(view.asOf)} · money in {view.currency}
      </p>
      <div style={s.grid}>
        {view.decisions.map((d) => (
          <section key={d.id} style={s.tile} data-testid={`decision-${d.id}`} aria-labelledby={`decision-${d.id}-title`}>
            <div style={s.tileHead}>
              <h3 id={`decision-${d.id}-title`} style={s.title}>{d.title}</h3>
              <span style={s.cap}>{d.capability}</span>
            </div>
            <p style={s.question}>{d.question}</p>
            {d.state === 'unavailable' ? (
              <p style={s.unavailable} data-testid={`decision-${d.id}-unavailable`}>Not measured: {d.unavailableReason}</p>
            ) : (
              <>
                <div style={s.headline} data-testid={`decision-${d.id}-headline`}>
                  {figureText(d.figures[0], view.currency)}
                  <span style={s.headlineLabel}>{d.figures[0].label}</span>
                </div>
                {d.figures.length > 1 && (
                  <ul style={s.figures}>
                    {d.figures.slice(1).map((f) => (
                      <li key={f.label}><strong>{figureText(f, view.currency)}</strong> {f.label}</li>
                    ))}
                  </ul>
                )}
                <p style={s.population} data-testid={`decision-${d.id}-population`}>
                  Counted {d.population.counted} — {d.population.of}
                </p>
                {d.population.excluded.map((e) => (
                  <p key={e.reason} style={s.excluded}>Left out: {e.count} — {e.reason}</p>
                ))}
                {d.basis && <p style={s.basis}>{d.basis}</p>}
              </>
            )}
            <p style={s.source}>Source: {d.source}</p>
            {d.state === 'measured' && (
              <a href={`/executive/${d.id}`} style={s.drill} data-testid={`decision-${d.id}-drill`}>
                Open the {d.recordCount} {d.recordCount === 1 ? 'record' : 'records'} →
              </a>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const s = {
  readAt: { margin: '0 0 14px', color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 } as CSSProperties,
  tile: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
  tileHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 } as CSSProperties,
  title: { margin: 0, fontSize: 14.5, fontWeight: 700 } as CSSProperties,
  cap: { fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  question: { margin: 0, fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  headline: { fontSize: 24, fontWeight: 750, display: 'flex', flexDirection: 'column', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  headlineLabel: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' } as CSSProperties,
  figures: { margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6 } as CSSProperties,
  population: { margin: '4px 0 0', fontSize: 12, color: 'var(--text)' } as CSSProperties,
  excluded: { margin: 0, fontSize: 11.5, color: 'var(--warn, var(--muted))' } as CSSProperties,
  basis: { margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45 } as CSSProperties,
  unavailable: { margin: '4px 0', fontSize: 13, color: 'var(--bad)' } as CSSProperties,
  source: { margin: 'auto 0 0', paddingTop: 6, fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  drill: { fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
};
