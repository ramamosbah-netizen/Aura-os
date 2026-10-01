'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Pager, { usePaged } from './ui/pager';
import { measureText, type RecordUnit } from './executive-decisions-grid';

export interface DecisionRecord { id: string; label: string; href: string; value: number | null; unit: RecordUnit | null; status: string | null; note: string | null }

/**
 * The exact records behind one executive decision, a page at a time, with a find box. The list is
 * the decision's whole counted population (the API returns it in the same pass as the figure), so
 * finding narrows what is SHOWN and the summary still says how many there are in all.
 */
export default function ExecutiveDecisionRecords({ records, currency }: { records: DecisionRecord[]; currency: string }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => [r.label, r.status ?? '', r.note ?? ''].some((text) => text.toLowerCase().includes(q)));
  }, [records, query]);
  const paged = usePaged(shown, 25);

  return (
    <div>
      <div style={s.bar}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a record"
          aria-label="Find a record"
          style={s.find}
          data-testid="decision-records-find"
        />
        <span style={s.count} data-testid="decision-records-count">
          {query.trim() ? `${shown.length} of ${records.length} records match` : `${records.length} ${records.length === 1 ? 'record' : 'records'}`}
        </span>
      </div>
      <table className="data-table" data-testid="decision-records">
        <thead><tr><th>Record</th><th>Status</th><th style={{ textAlign: 'right' }}>Measure</th><th>Detail</th></tr></thead>
        <tbody>
          {paged.slice.map((r) => (
            <tr key={r.id} data-testid={`decision-record-${r.id}`}>
              <td><a href={r.href}>{r.label}</a></td>
              <td>{r.status ?? '—'}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {r.value === null || r.unit === null ? '—' : measureText(r.value, r.unit, currency)}
              </td>
              <td style={{ color: 'var(--muted)' }}>{r.note ?? ''}</td>
            </tr>
          ))}
          {paged.slice.length === 0 && (
            <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No record matches “{query.trim()}”.</td></tr>
          )}
        </tbody>
      </table>
      <Pager state={paged} label="records" testId="decision-records-pager" />
    </div>
  );
}

const s = {
  bar: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' } as CSSProperties,
  find: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 13, minWidth: 240 } as CSSProperties,
  count: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
};
