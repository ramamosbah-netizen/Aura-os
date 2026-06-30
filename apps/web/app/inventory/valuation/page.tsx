import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Line { itemId: string; code: string; name: string; warehouse: string; unit: string; quantityOnHand: number; avgCost: number; totalValue: number }
interface ValuationSummary { lines: Line[]; grandTotal: number }

function n(v: number, d = 2) { return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }

export default async function ValuationPage() {
  const v = await getJson<ValuationSummary>('/api/inventory/stock/valuation');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Valuation</h1>
      <p style={st.sub}>
        Stock value at moving-average (weighted-average) cost: value = on-hand × avg cost. Receipts
        re-average the cost; issues draw down at the running average.
      </p>
      {v === null ? (
        <p style={st.muted}>API offline.</p>
      ) : v.lines.length === 0 ? (
        <p style={st.muted}>No stock items yet.</p>
      ) : (
        <div style={st.panel}>
          <table style={st.table}>
            <thead><tr>
              <th style={st.th}>Item</th><th style={st.th}>Warehouse</th>
              {['On hand', 'Avg cost', 'Value'].map((h) => <th key={h} style={{ ...st.th, textAlign: 'right' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {v.lines.map((l) => (
                <tr key={l.itemId}>
                  <td style={st.td}><span style={st.code}>{l.code}</span> {l.name}</td>
                  <td style={st.tdM}>{l.warehouse}</td>
                  <td style={st.tdNum}>{n(l.quantityOnHand, 0)} {l.unit}</td>
                  <td style={st.tdNum}>{n(l.avgCost, 4)}</td>
                  <td style={st.tdNum}>{n(l.totalValue)}</td>
                </tr>
              ))}
              <tr>
                <td style={st.totalLabel} colSpan={4}>Total inventory value</td>
                <td style={st.totalVal}>{n(v.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 860, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdM: { padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tdNum: { padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--muted)', marginRight: 6 } as CSSProperties,
  totalLabel: { padding: '10px 12px', fontWeight: 700, borderTop: '2px solid var(--border)' } as CSSProperties,
  totalVal: { padding: '10px 12px', fontWeight: 700, textAlign: 'right', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
};
