'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Pager, { usePaged } from '@/components/ui/pager';

/**
 * The drawing register, a page at a time.
 *
 * The register page itself is a server component — it reads the drawings and sorts them — so the
 * table lives here instead: paging is view state, and view state needs a client. Nothing is
 * re-fetched when the page turns; the whole register is already loaded, and the sort that puts
 * superseded revisions at the bottom is applied to the WHOLE register before it is sliced, so page
 * one is the live drawings rather than the first twenty of an arbitrary order.
 *
 * The search box is not decoration and was not optional. This register had no filter of any kind,
 * so paging it meant the only way to reach a known drawing was clicking Next until it appeared —
 * on a register of four hundred, twenty pages of it. Search matches code, title and discipline over
 * the WHOLE register, and the pager then pages what is left.
 */
export interface DrawingRow {
  id: string;
  code: string;
  title: string;
  revision: string;
  status: string;
  discipline: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  revision_required: 'Revision Required',
  transmitted: 'Transmitted',
  closed: 'Closed',
  superseded: 'Superseded',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    approved: { background: 'var(--good-soft)', color: 'var(--good)' },
    transmitted: { background: 'var(--good-soft)', color: 'var(--good)' },
    closed: { background: 'var(--panel-2)', color: 'var(--muted)' },
    superseded: { background: 'var(--panel-2)', color: 'var(--muted)' },
    rejected: { background: 'var(--bad-soft)', color: 'var(--bad)' },
    revision_required: { background: 'var(--warn-soft)', color: 'var(--warn)' },
    under_review: { background: 'var(--info-soft)', color: 'var(--info)' },
    submitted: { background: 'var(--info-soft)', color: 'var(--info)' },
    draft: { background: 'var(--panel-2)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}

export default function DrawingRegisterTable({ rows }: { rows: DrawingRow[] }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) => `${d.code} ${d.title} ${d.discipline}`.toLowerCase().includes(q));
  }, [rows, query]);
  const page = usePaged(matches);

  return (
    <>
      <div style={st.searchRow}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search drawing, title or discipline"
          style={st.search}
          data-testid="drawing-register-search"
        />
        <span style={st.count} data-testid="drawing-register-count">
          {matches.length === rows.length
            ? `${rows.length} drawing${rows.length === 1 ? '' : 's'}`
            : `${matches.length} of ${rows.length} drawings`}
        </span>
      </div>

      {matches.length === 0 ? (
        <div style={st.noMatch} data-testid="drawing-register-no-match">
          No drawing matches “{query.trim()}”. The register holds {rows.length}.
        </div>
      ) : (
      <>
      <div style={st.tableWrap}>
        <table style={st.table} data-testid="drawing-register">
          <thead>
            <tr>
              {['Drawing', 'Rev', 'Title', 'Discipline', 'Status', ''].map((h) => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.slice.map((d) => (
              <tr key={d.id} style={d.status === 'superseded' ? st.rowMuted : undefined}>
                <td style={st.tdCode}>{d.code}</td>
                <td style={st.tdMuted}>{d.revision}</td>
                <td style={st.td} title={d.title}>{d.title}</td>
                <td style={st.tdMuted}>{d.discipline}</td>
                <td style={st.td}><span style={statusStyle(d.status)}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                <td style={st.td}>
                  <a href={`/engineering/drawings/${d.id}`} style={st.open} data-testid={`open-${d.code}-${d.revision}`}>
                    Open →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager state={page} label="drawings" testId="drawing-register-pager" />
      </>
      )}
    </>
  );
}

const st = {
  searchRow: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 } as CSSProperties,
  search: { flex: 1, minWidth: 0, maxWidth: 420, background: 'var(--panel-2)', border: '1px solid var(--border, #d1d5db)', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, color: 'var(--text)', fontFamily: 'inherit' } as CSSProperties,
  count: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  noMatch: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 24, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap:{ overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  rowMuted: { opacity: 0.55 } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
