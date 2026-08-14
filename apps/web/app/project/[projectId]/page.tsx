import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import { PROJECT_AREAS } from '@/lib/project-areas';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { projectId?: string };

/** Fetch one area's records, scoped to this project. Tolerant of a null/!array response. */
async function areaRows(endpoint: string, projectId: string): Promise<Row[]> {
  const data = await getJson<Row[]>(endpoint);
  return (Array.isArray(data) ? data : []).filter((r) => r.projectId === projectId);
}

/** A compact status breakdown, most-common first. */
function summarise(rows: Row[], key: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[key] ?? 'unknown');
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const areaData = await Promise.all(
    PROJECT_AREAS.map(async (a) => ({ area: a, rows: await areaRows(a.endpoint, projectId) })),
  );

  const totalRecords = areaData.reduce((n, d) => n + d.rows.length, 0);

  return (
    <div>
      <h1 style={st.h1}>Delivery overview</h1>
      <p style={st.sub}>
        Everything being delivered on this project, in one place — {totalRecords} record{totalRecords === 1 ? '' : 's'} across{' '}
        {PROJECT_AREAS.length} areas. Open an area to work in it; each record still opens its full 360.
      </p>

      <div style={st.grid}>
        {areaData.map(({ area, rows }) => {
          const breakdown = summarise(rows, area.statusKey);
          return (
            <Link key={area.slug} href={`/project/${projectId}/${area.slug}`} style={st.card}>
              <div style={st.cardHead}>
                <span style={st.cardIcon}>{area.icon}</span>
                <span style={st.cardLabel}>{area.label}</span>
                <span style={st.cardCount}>{rows.length}</span>
              </div>
              {rows.length === 0 ? (
                <div style={st.empty}>No {area.entity}s yet</div>
              ) : (
                <div style={st.breakdown}>
                  {breakdown.slice(0, 4).map(([status, n]) => (
                    <span key={status} style={st.chip}>
                      {status.replace(/_/g, ' ')} <b>{n}</b>
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  h1: { fontSize: 22, margin: '0 0 6px', color: 'var(--accent)' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5, maxWidth: 720 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 } as CSSProperties,
  card: { display: 'block', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--panel)', textDecoration: 'none', color: 'var(--text)' } as CSSProperties,
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } as CSSProperties,
  cardIcon: { fontSize: 18 } as CSSProperties,
  cardLabel: { fontSize: 14, fontWeight: 700 } as CSSProperties,
  cardCount: { marginLeft: 'auto', fontSize: 20, fontWeight: 800, color: 'var(--accent)' } as CSSProperties,
  empty: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  breakdown: { display: 'flex', flexWrap: 'wrap', gap: 6 } as CSSProperties,
  chip: { fontSize: 11.5, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px', textTransform: 'capitalize' } as CSSProperties,
};
