'use client';

import { type CSSProperties, useState } from 'react';

// AI pricing review on the pricing sheet. What it shows is grounded: each line's margin, and how
// its price sits against the Market Intelligence benchmark and past quotes. The findings are
// computed deterministically and can be checked; a written narrative is added only when a real AI
// provider is configured (locally the provider echoes, so no fake advice is shown).

interface LineFinding { description: string; marginPercent: number; band: 'loss' | 'thin' | 'healthy' | 'high'; notes: string[] }
interface Advice {
  blendedMargin: number; lossLines: number; thinLines: number; aboveMarketLines: number; belowMarketLines: number;
  findings: LineFinding[]; headline: string;
}
interface Response { advice: Advice; narrative: string | null; provider: string }

const BAND: Record<LineFinding['band'], { label: string; color: string }> = {
  loss: { label: 'loss', color: 'var(--bad)' },
  thin: { label: 'thin', color: 'var(--warn)' },
  healthy: { label: 'ok', color: 'var(--good)' },
  high: { label: 'high', color: 'var(--warn)' },
};

export default function PricingAdvicePanel({ id }: { id: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function review(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/quotations/${id}/pricing/advice`, { cache: 'no-store' });
      if (!res.ok) { setErr('Could not run the review.'); return; }
      setData(await res.json());
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  // Only the lines that actually have something to say — a clean line needs no comment.
  const flagged = data?.advice.findings.filter((f) => f.notes.length > 0) ?? [];

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <b>Pricing review</b>
        <button type="button" onClick={() => void review()} disabled={busy} style={st.run}>
          {busy ? 'Reviewing…' : data ? 'Re-run review' : 'Review pricing'}
        </button>
      </div>
      {err && <p style={st.err}>{err}</p>}

      {!data && !err && (
        <p style={st.idle}>
          Checks every line's margin and compares its price against the Market Intelligence benchmark
          and what you've quoted this item for before — then flags what to look at.
        </p>
      )}

      {data && (
        <>
          <p style={st.headline}>{data.advice.headline}</p>

          {data.narrative
            ? <p style={st.narrative}>{data.narrative}</p>
            : <p style={st.noAi}>Written AI advice appears when an AI provider is configured (currently: {data.provider}). The findings below stand on their own.</p>}

          {flagged.length === 0
            ? <p style={st.clean}>Nothing to flag — every line's margin and price look reasonable against the benchmarks.</p>
            : (
              <ul style={st.list}>
                {flagged.map((f) => (
                  <li key={f.description} style={st.row}>
                    <div style={st.rowHead}>
                      <span style={st.rowName}>{f.description}</span>
                      <span style={{ ...st.badge, color: BAND[f.band].color, borderColor: BAND[f.band].color }}>
                        {f.marginPercent}% · {BAND[f.band].label}
                      </span>
                    </div>
                    <ul style={st.notes}>
                      {f.notes.map((n, i) => <li key={i} style={st.note}>{n}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </div>
  );
}

const st = {
  wrap: { border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18, background: 'var(--panel)' } as CSSProperties,
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 } as CSSProperties,
  run: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 8, color: 'var(--text, var(--fg))', padding: '6px 13px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  idle: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
  headline: { fontSize: 13.5, fontWeight: 700, margin: '0 0 8px' } as CSSProperties,
  narrative: { fontSize: 13, lineHeight: 1.6, color: 'var(--text, var(--fg))', margin: '0 0 12px', padding: '10px 12px', background: 'var(--panel-2, var(--panel))', borderRadius: 8, borderLeft: '3px solid var(--accent)' } as CSSProperties,
  noAi: { fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 12px' } as CSSProperties,
  clean: { color: 'var(--good)', fontSize: 12.5, margin: 0 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  row: { borderTop: '1px solid var(--border)', paddingTop: 10 } as CSSProperties,
  rowHead: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' } as CSSProperties,
  rowName: { fontSize: 13, fontWeight: 600 } as CSSProperties,
  badge: { border: '1px solid', borderRadius: 999, padding: '1px 9px', fontSize: 11, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  notes: { listStyle: 'none', margin: '5px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  note: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12, margin: '0 0 8px' } as CSSProperties,
};
