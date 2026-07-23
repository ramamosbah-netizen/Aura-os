'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { analyseSheet, type EstimationLineInput } from '@aura/shared';

// The Intelligence Center — the whole offer's dossier in one place, instead of intelligence
// scattered across screens. For EVERY line on the sheet at once: its market benchmark, price
// history, supplier offers, stock on hand, and alternatives — all from the single Product
// Knowledge read — plus the sheet's risk flags. This is the tab an approver opens to ask
// "what does the market say about this whole offer?" and get one answer.

interface Knowledge {
  products: Array<{
    id: string; name: string; brand: string | null; benchmarkSell: number; benchmarkCost: number;
    installHours: number; leadTimeDays: number | null; confidence: number;
    alternatives: Array<{ id: string; name: string }>;
  }>;
  history: Array<{ description: string; count: number; lastPrice: number }>;
  suppliers: Array<{ supplier: string; amount: number; rfq: string }>;
  inventory: Array<{ name: string; quantityOnHand: number; avgCost: number }>;
}

const money = (n: number): string => (Number.isFinite(n) ? n : 0).toLocaleString('en-AE', { maximumFractionDigits: 2 });

export default function IntelligenceCenter({ lines }: { lines: EstimationLineInput[] }) {
  const priced = lines.filter((l) => l.description.trim().length >= 2);
  const [rows, setRows] = useState<Array<{ description: string; k: Knowledge }> | null>(null);
  const advice = analyseSheet(lines);

  useEffect(() => {
    let cancelled = false;
    if (priced.length === 0) { setRows([]); return; }
    Promise.all(
      priced.map(async (l) => ({
        description: l.description,
        k: (await fetch(`/api/crm/product-knowledge?q=${encodeURIComponent(l.description)}`, { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ products: [], history: [], suppliers: [], inventory: [] }))) as Knowledge,
      })),
    ).then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
    // Re-query when the set of descriptions changes, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced.map((l) => l.description).join('|')]);

  if (priced.length === 0) {
    return <p style={st.muted}>Add items to the sheet first — the Intelligence Center reads the market for every line at once.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Risks — the sheet-level flags, front and centre where an approver looks first. */}
      <div style={st.card}>
        <div style={st.cardHead}>Risks & review</div>
        {advice.flags.length === 0 ? <p style={st.muted}>Nothing flagged.</p> : (
          <ul style={st.flags}>
            {advice.flags.map((f, i) => (
              <li key={i} style={{ ...st.flag, color: f.tone === 'bad' ? 'var(--bad)' : f.tone === 'warn' ? 'var(--warn)' : 'var(--good)' }}>
                {f.tone === 'ok' ? '✓' : '⚠'} {f.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The dossier — one row per line, every source side by side. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={st.table}>
          <thead>
            <tr>{['Item', 'Market benchmark', 'History', 'Supplier offers', 'Inventory', 'Alternatives'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={6} style={st.td}><span style={st.muted}>Reading the market…</span></td></tr>
            ) : rows.map(({ description, k }) => {
              const p = k.products[0];
              const h = k.history[0];
              const s = k.suppliers[0];
              const inv = k.inventory[0];
              return (
                <tr key={description}>
                  <td style={st.td}><b>{description}</b></td>
                  <td style={st.td}>
                    {p ? (
                      <>
                        {money(p.benchmarkSell)} <span style={st.dim}>sell · {p.confidence}% conf.</span>
                        {p.leadTimeDays != null && <div style={st.dim}>{p.leadTimeDays}d lead</div>}
                      </>
                    ) : <span style={st.dim}>no benchmark</span>}
                  </td>
                  <td style={st.td}>{h ? <>{money(h.lastPrice)} <span style={st.dim}>last · {h.count}×</span></> : <span style={st.dim}>never quoted</span>}</td>
                  <td style={st.td}>{s ? <>{money(s.amount)} <span style={st.dim}>{s.supplier}</span></> : <span style={st.dim}>no offers</span>}</td>
                  <td style={st.td}>{inv ? <>{inv.quantityOnHand} <span style={st.dim}>on hand</span></> : <span style={st.dim}>not stocked{p?.leadTimeDays != null ? ` · ~${p.leadTimeDays}d to procure` : ''}</span>}</td>
                  <td style={st.td}>{p && p.alternatives.length > 0 ? p.alternatives.map((a) => a.name).join(', ') : <span style={st.dim}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const st = {
  card: { border: '1px solid var(--border)', borderRadius: 11, padding: 14, background: 'var(--panel)' } as CSSProperties,
  cardHead: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 8 } as CSSProperties,
  flags: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  flag: { fontSize: 12.5, lineHeight: 1.5 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' } as CSSProperties,
  dim: { color: 'var(--muted)', fontSize: 11.5 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
};
