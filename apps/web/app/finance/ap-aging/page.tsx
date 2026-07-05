import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

type BucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';
const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1–30' },
  { key: 'd31_60', label: '31–60' },
  { key: 'd61_90', label: '61–90' },
  { key: 'd90_plus', label: '90+' },
];

interface ApAgingReport {
  asOf: string;
  bySupplier: { supplierName: string; buckets: Record<BucketKey, number>; total: number }[];
  totals: Record<BucketKey, number>;
  grandTotal: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ApAgingPage() {
  const report = await getJson<ApAgingReport>('/api/finance/invoices/aging');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · AP Aging</h1>
      <p style={st.sub}>
        Approved-but-unpaid supplier liability bucketed by how long each invoice has been outstanding
        (from invoice date). Only approved invoices count — draft, paid and cancelled are excluded.
      </p>
      {report === null ? (
        <p style={st.muted}>API offline.</p>
      ) : report.bySupplier.length === 0 ? (
        <p style={st.muted}>No outstanding payables as of {report.asOf}.</p>
      ) : (
        <>
          <p style={st.asOf}>As of <b>{report.asOf}</b> · total payable <b>{fmt(report.grandTotal)} AED</b></p>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.thL}>Supplier</th>
                {BUCKETS.map((b) => <th key={b.key} style={st.th}>{b.label}</th>)}
                <th style={st.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {report.bySupplier.map((row) => (
                <tr key={row.supplierName}>
                  <td style={st.tdL}>{row.supplierName}</td>
                  {BUCKETS.map((b) => <td key={b.key} style={st.td}>{row.buckets[b.key] ? fmt(row.buckets[b.key]) : '—'}</td>)}
                  <td style={{ ...st.td, fontWeight: 600 }}>{fmt(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...st.tdL, fontWeight: 700 }}>Total</td>
                {BUCKETS.map((b) => <td key={b.key} style={{ ...st.td, fontWeight: 700 }}>{fmt(report.totals[b.key])}</td>)}
                <td style={{ ...st.td, fontWeight: 700 }}>{fmt(report.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  asOf: { margin: '0 0 12px', fontSize: 14 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0', margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thL: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdL: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
