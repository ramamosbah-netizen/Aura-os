import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Pricing Sheets hub — every tender with an internal Cost & Resource Breakdown,
// with per-sheet and summary CSV exports. The sheets stay company-internal.

interface SheetSummary {
  tenderId: string;
  tenderTitle: string;
  reference: string | null;
  client: string | null;
  status: string;
  boqItems: number;
  pricedItems: number;
  directCost: number;
  sellingValue: number;
  unpricedBoqValue: number;
  tenderValue: number;
  marginPercent: number;
}

const aed = (n: number): string => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 2 }).format(n);

export default async function PricingSheetsPage() {
  const sheets = (await getJson<SheetSummary[]>('/api/tendering/tenders/pricing/sheets')) ?? [];

  return (
    <div style={st.container}>
      <div style={st.head}>
        <div>
          <h1 style={st.h1}>Pricing Sheets</h1>
          <p style={st.sub}>
            Internal cost &amp; resource breakdowns across all tenders — open a sheet to price lines, export any
            sheet as the original spreadsheet.
          </p>
        </div>
        <a href="/api/tendering/pricing/sheets/csv" style={st.btn}>⤓ Export summary CSV</a>
      </div>

      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr>
              {['Tender', 'Client', 'Status', 'Priced', 'Direct cost', 'Selling value', 'Tender value', 'Margin', ''].map((h, i) => (
                <th key={i} style={{ ...st.th, textAlign: i <= 2 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheets.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...st.td, textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
                  No pricing sheets yet — open a tender and use “Pricing sheet (internal)” to price its BOQ.
                </td>
              </tr>
            )}
            {sheets.map((s) => (
              <tr key={s.tenderId}>
                <td style={{ ...st.td, textAlign: 'left' }}>
                  <a href={`/tendering/tenders/${s.tenderId}/pricing`} style={st.link}>{s.tenderTitle}</a>
                  {s.reference && <span style={st.refTag}>{s.reference}</span>}
                </td>
                <td style={{ ...st.td, textAlign: 'left' }}>{s.client ?? '—'}</td>
                <td style={{ ...st.td, textAlign: 'left' }}><span style={st.status}>{s.status}</span></td>
                <td style={{ ...st.td, textAlign: 'right' }}>
                  <span style={s.pricedItems === s.boqItems ? st.pricedFull : st.pricedPart}>
                    {s.pricedItems}/{s.boqItems}
                  </span>
                </td>
                <td style={{ ...st.td, textAlign: 'right' }}>{aed(s.directCost)}</td>
                <td style={{ ...st.td, textAlign: 'right' }}>{aed(s.sellingValue)}</td>
                <td style={{ ...st.td, textAlign: 'right', fontWeight: 700 }}>{aed(s.tenderValue)}</td>
                <td style={{ ...st.td, textAlign: 'right', color: 'var(--good)', fontWeight: 600 }}>{s.marginPercent}%</td>
                <td style={{ ...st.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <a href={`/tendering/tenders/${s.tenderId}/pricing`} style={st.rowBtn}>Open</a>
                  <a href={`/api/tendering/tenders/${s.tenderId}/pricing/csv`} style={st.rowBtn}>⤓ CSV</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 6px', color: 'var(--accent)' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 13, margin: 0, lineHeight: 1.5, maxWidth: 640 } as CSSProperties,
  btn: { border: '1px solid var(--border)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 } as CSSProperties,
  th: { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' } as CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  refTag: { marginLeft: 8, fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  status: { fontSize: 11.5, textTransform: 'capitalize', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px' } as CSSProperties,
  pricedFull: { color: 'var(--good)', fontWeight: 700 } as CSSProperties,
  pricedPart: { color: 'var(--warn, #d97706)', fontWeight: 600 } as CSSProperties,
  rowBtn: { display: 'inline-block', marginLeft: 6, border: '1px solid var(--border)', borderRadius: 7, padding: '4px 9px', fontSize: 12, color: 'var(--fg)', textDecoration: 'none' } as CSSProperties,
};
