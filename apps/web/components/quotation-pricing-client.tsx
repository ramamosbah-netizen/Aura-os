'use client';

import { type CSSProperties, useMemo, useState } from 'react';

// Quotation pricing sheet — editable internal cost per line; margin derived
// against the fixed quoted sell price. Mirrors modules/crm computeQuotationPricing
// so the on-screen numbers match the server sheet; Save PUTs the unit costs.

export interface PricingLine {
  description: string; quantity: number; unitCost: number; unitPrice: number;
  costTotal: number; sellTotal: number; marginAmount: number;
  marginPercent: number | null; markupPercent: number | null;
}
export interface PricingSheet {
  lines: PricingLine[]; totalCost: number; totalSell: number; marginAmount: number; marginPercent: number | null;
}

const money = (n: number): string => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);
const marginColor = (n: number | null): string => (n === null ? 'var(--muted)' : n < 15 ? 'var(--bad)' : n < 30 ? 'var(--accent)' : 'var(--good)');

function compute(lines: PricingLine[], costs: number[]): PricingSheet {
  const rows = lines.map((l, i) => {
    const unitCost = Number(costs[i] ?? 0);
    const costTotal = round2(l.quantity * unitCost);
    const sellTotal = l.sellTotal;
    const marginAmount = round2(sellTotal - costTotal);
    return {
      ...l, unitCost, costTotal, marginAmount,
      marginPercent: sellTotal > 0 ? round2((marginAmount / sellTotal) * 100) : null,
      markupPercent: costTotal > 0 ? round2((marginAmount / costTotal) * 100) : null,
    };
  });
  const totalCost = round2(rows.reduce((s, r) => s + r.costTotal, 0));
  const totalSell = round2(rows.reduce((s, r) => s + r.sellTotal, 0));
  const marginAmount = round2(totalSell - totalCost);
  return { lines: rows, totalCost, totalSell, marginAmount, marginPercent: totalSell > 0 ? round2((marginAmount / totalSell) * 100) : null };
}

export default function QuotationPricingClient({ id, customerName, status, initialSheet }: {
  id: string; customerName: string; status: string; initialSheet: PricingSheet;
}) {
  const [costs, setCosts] = useState<number[]>(initialSheet.lines.map((l) => l.unitCost));
  const [saved, setSaved] = useState<number[]>(initialSheet.lines.map((l) => l.unitCost));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sheet = useMemo(() => compute(initialSheet.lines, costs), [initialSheet.lines, costs]);
  const dirty = costs.some((c, i) => c !== saved[i]);

  const setCost = (i: number, v: string): void => {
    const n = Number(v);
    setCosts((prev) => prev.map((c, j) => (j === i ? (Number.isFinite(n) && n >= 0 ? n : 0) : c)));
  };

  const save = async (): Promise<void> => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${id}/pricing`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unitCosts: costs }),
      });
      if (!res.ok) { setMsg('Save failed'); return; }
      setSaved([...costs]); setMsg('Saved ✓');
    } catch { setMsg('API unreachable'); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={st.toolbar}>
        <span style={st.customer}>{customerName} · <span style={{ textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span></span>
        <div style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: msg.includes('✓') ? 'var(--good)' : 'var(--bad)' }}>{msg}</span>}
        <button type="button" onClick={() => void save()} disabled={busy || !dirty}
          style={{ ...st.save, ...(dirty && !busy ? {} : st.saveDisabled) }}>Save costs</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={st.table}>
          <thead><tr>
            {['Description', 'Qty', 'Unit cost', 'Unit sell', 'Cost total', 'Sell total', 'Margin', 'Markup'].map((h, i) => (
              <th key={h} style={{ ...st.th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sheet.lines.map((l, i) => (
              <tr key={i}>
                <td style={st.td}>{l.description}</td>
                <td style={st.tdR}>{l.quantity}</td>
                <td style={st.tdR}>
                  <input type="number" min={0} step="0.01" value={costs[i]} onChange={(e) => setCost(i, e.target.value)} style={st.input} />
                </td>
                <td style={st.tdR}>{money(l.unitPrice)}</td>
                <td style={st.tdR}>{money(l.costTotal)}</td>
                <td style={st.tdR}>{money(l.sellTotal)}</td>
                <td style={{ ...st.tdR, color: marginColor(l.marginPercent), fontWeight: 700 }}>{pct(l.marginPercent)}</td>
                <td style={{ ...st.tdR, color: 'var(--muted)' }}>{pct(l.markupPercent)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ ...st.tdR, fontWeight: 800 }}>Totals</td>
              <td style={{ ...st.tdR, fontWeight: 800 }}>{money(sheet.totalCost)}</td>
              <td style={{ ...st.tdR, fontWeight: 800 }}>{money(sheet.totalSell)}</td>
              <td style={{ ...st.tdR, fontWeight: 800, color: marginColor(sheet.marginPercent) }}>{pct(sheet.marginPercent)}</td>
              <td style={st.tdR} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={st.summary}>
        <Stat label="Total cost" value={money(sheet.totalCost)} />
        <Stat label="Total sell" value={money(sheet.totalSell)} />
        <Stat label="Gross margin" value={money(sheet.marginAmount)} />
        <Stat label="Blended margin" value={pct(sheet.marginPercent)} tone={marginColor(sheet.marginPercent)} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={st.stat}>
      <div style={st.statLabel}>{label}</div>
      <div style={{ ...st.statValue, ...(tone ? { color: tone } : {}) }}>{value}</div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  customer: { fontSize: 12.5, color: 'var(--muted)' },
  save: { border: '1px solid var(--accent)', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'transparent', cursor: 'pointer' },
  saveDisabled: { opacity: 0.45, cursor: 'default', borderColor: 'var(--border)', color: 'var(--muted)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border)' },
  tdR: { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  input: { width: 92, boxSizing: 'border-box', textAlign: 'right', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--fg)', padding: '5px 8px', fontSize: 12.5 },
  summary: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', marginTop: 16 },
  stat: { minWidth: 110 },
  statLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 3 },
  statValue: { fontSize: 17, fontWeight: 800 },
};
