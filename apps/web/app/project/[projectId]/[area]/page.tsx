import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import { findArea, type AreaColumn } from '@/lib/project-areas';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { id?: string; projectId?: string };

function cell(row: Row, col: AreaColumn): ReactNode {
  const raw = row[col.key];
  if (raw === null || raw === undefined || raw === '') return <span style={{ color: 'var(--muted)' }}>—</span>;
  if (col.kind === 'date') return String(raw).slice(0, 10);
  if (col.kind === 'status') {
    const v = String(raw);
    const good = /approved|closed|issued|commissioned|accepted|passed/i.test(v);
    const bad = /rejected|failed|open|overdue|expired/i.test(v);
    return <span className={good ? 'badge badge-good' : bad ? 'badge badge-bad' : 'badge'}>{v.replace(/_/g, ' ')}</span>;
  }
  if (col.kind === 'code') return <span style={{ fontFamily: 'ui-monospace, monospace' }}>{String(raw)}</span>;
  return String(raw);
}

export default async function ProjectAreaPage({ params }: { params: Promise<{ projectId: string; area: string }> }) {
  const { projectId, area: slug } = await params;
  const area = findArea(slug);
  if (!area) notFound();

  const data = await getJson<Row[]>(area.endpoint);
  const rows = (Array.isArray(data) ? data : []).filter((r) => r.projectId === projectId);

  return (
    <div>
      <h1 style={st.h1}>
        <span style={{ marginRight: 8 }}>{area.icon}</span>
        {area.label}
        <span style={st.count}>{rows.length}</span>
      </h1>

      {rows.length === 0 ? (
        <p style={st.empty}>No {area.entity}s on this project yet.</p>
      ) : (
        <div style={st.tableWrap}>
          <table className="data-table">
            <thead>
              <tr>
                {area.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {area.rowHref ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row.id as string) ?? i}>
                  {area.columns.map((c) => (
                    <td key={c.key} style={c.key === area.columns[0].key ? { fontWeight: 600 } : undefined}>
                      {cell(row, c)}
                    </td>
                  ))}
                  {area.rowHref ? (
                    <td style={{ textAlign: 'right' }}>
                      {row.id ? (
                        <Link href={`${area.rowHref}/${row.id}`} style={st.open}>
                          Open →
                        </Link>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  h1: { fontSize: 22, margin: '0 0 16px', color: 'var(--accent)', display: 'flex', alignItems: 'center' } as CSSProperties,
  count: { marginLeft: 12, fontSize: 14, fontWeight: 700, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 10px' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  tableWrap: { overflowX: 'auto' } as CSSProperties,
  open: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' } as CSSProperties,
};
