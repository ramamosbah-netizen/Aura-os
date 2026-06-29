'use client';

import { type CSSProperties, useState } from 'react';

type Bucket = 'expired' | 'critical' | 'warning' | 'ok';

interface ExpiryItem {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  documentType: string;
  expiryDate: string;
  daysToExpiry: number;
  bucket: Bucket;
}
interface Counts {
  expired: number;
  critical: number;
  warning: number;
  ok: number;
  total: number;
}

const BUCKET_LABEL: Record<Bucket, string> = {
  expired: 'Expired',
  critical: 'Critical (≤30d)',
  warning: 'Warning (≤90d)',
  ok: 'OK',
};
const bucketColor = (b: Bucket): string =>
  b === 'expired' ? 'var(--bad)' : b === 'critical' ? '#e8a33d' : b === 'warning' ? 'var(--accent)' : 'var(--good)';

function daysLabel(d: number): string {
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'today';
  return `in ${d}d`;
}

export default function DocumentExpiryClient({
  initialItems,
  counts,
  asOf,
}: {
  initialItems: ExpiryItem[];
  counts: Counts;
  asOf: string;
}) {
  const [filter, setFilter] = useState<Bucket | 'all' | 'attention'>('attention');

  const visible = initialItems.filter((it) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return it.bucket === 'expired' || it.bucket === 'critical' || it.bucket === 'warning';
    return it.bucket === filter;
  });

  const chip = (key: Bucket | 'all' | 'attention', label: string, count: number, color?: string) => (
    <button type="button" style={filter === key ? s.chipActive(color) : s.chip} onClick={() => setFilter(key)}>
      {label} <span style={s.chipCount}>{count}</span>
    </button>
  );

  return (
    <div>
      <div style={s.chips}>
        {chip('attention', 'Needs attention', counts.expired + counts.critical + counts.warning)}
        {chip('expired', BUCKET_LABEL.expired, counts.expired, bucketColor('expired'))}
        {chip('critical', BUCKET_LABEL.critical, counts.critical, bucketColor('critical'))}
        {chip('warning', BUCKET_LABEL.warning, counts.warning, bucketColor('warning'))}
        {chip('ok', BUCKET_LABEL.ok, counts.ok, bucketColor('ok'))}
        {chip('all', 'All', counts.total)}
        {asOf && <span style={s.asOf}>as of {asOf}</span>}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Employee</th>
            <th style={s.th}>Role</th>
            <th style={s.th}>Department</th>
            <th style={s.th}>Document</th>
            <th style={s.th}>Expiry</th>
            <th style={s.thR}>Time left</th>
            <th style={s.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td style={s.muted} colSpan={7}>Nothing in this bucket.</td></tr>
          ) : (
            visible.map((it) => (
              <tr key={`${it.employeeId}-${it.documentType}`} style={s.trow}>
                <td style={s.td}>{it.employeeName}</td>
                <td style={s.tdMuted}>{it.role}</td>
                <td style={s.tdMuted}>{it.department}</td>
                <td style={s.td}>{it.documentType}</td>
                <td style={s.tdMuted}>{it.expiryDate}</td>
                <td style={{ ...s.tdR, color: bucketColor(it.bucket), fontWeight: 600 }}>{daysLabel(it.daysToExpiry)}</td>
                <td style={s.td}><span style={s.tag(it.bucket)}>{BUCKET_LABEL[it.bucket]}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  chips: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 } as CSSProperties,
  chip: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--text)', padding: '6px 13px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  chipActive: (color?: string): CSSProperties => ({
    background: 'var(--panel-2)', border: `1px solid ${color ?? 'var(--accent)'}`, borderRadius: 999,
    color: color ?? 'var(--accent)', padding: '6px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
  }),
  chipCount: { opacity: 0.7, marginLeft: 2 } as CSSProperties,
  asOf: { color: 'var(--muted)', fontSize: 12.5, marginLeft: 'auto' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  trow: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px' } as CSSProperties,
  tag: (b: Bucket): CSSProperties => ({ fontSize: 11.5, color: bucketColor(b), border: `1px solid ${bucketColor(b)}`, borderRadius: 999, padding: '1px 9px' }),
};
