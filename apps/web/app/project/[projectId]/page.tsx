import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import { PROJECT_AREAS } from '@/lib/project-areas';
import { computeDigest, type Tone } from '@/lib/project-digest';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { projectId?: string };

/** Fetch one area's records, scoped to this project. Tolerant of a null/!array response. */
async function areaRows(endpoint: string, projectId: string): Promise<Row[]> {
  const data = await getJson<Row[]>(endpoint);
  return (Array.isArray(data) ? data : []).filter((r) => r.projectId === projectId);
}

function summarise(rows: Row[], key: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[key] ?? 'unknown');
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

const toneColor = (t: Tone): string =>
  t === 'bad' ? 'var(--bad)' : t === 'good' ? 'var(--good)' : t === 'accent' ? 'var(--accent)' : 'var(--muted)';

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const areaData = await Promise.all(
    PROJECT_AREAS.map(async (a) => ({ area: a, rows: await areaRows(a.endpoint, projectId) })),
  );
  const bySlug: Record<string, Row[]> = Object.fromEntries(areaData.map((d) => [d.area.slug, d.rows]));

  const digest = computeDigest({
    drawings: bySlug.engineering ?? [],
    dailyReports: bySlug.site ?? [],
    ncrs: bySlug.quality ?? [],
    permits: bySlug.hse ?? [],
    commissioning: bySlug.commissioning ?? [],
    documents: bySlug.documents ?? [],
  });

  const highCount = digest.blockers.filter((b) => b.severity === 'high').length;

  return (
    <div>
      <h1 style={st.h1}>Delivery overview</h1>
      <p style={st.sub}>
        Today&apos;s status across this project — {digest.totalRecords} record{digest.totalRecords === 1 ? '' : 's'} in{' '}
        {PROJECT_AREAS.length} areas, {digest.blockers.length} thing{digest.blockers.length === 1 ? '' : 's'} needing attention
        {highCount ? ` (${highCount} critical)` : ''}.
      </p>

      {/* KPI band */}
      <div style={st.kpis}>
        {digest.kpis.map((k) => (
          <Link key={k.area} href={`/project/${projectId}/${k.area}`} style={st.kpi}>
            <div style={st.kpiTop}>
              <span>{k.icon}</span>
              <span style={st.kpiLabel}>{k.label}</span>
            </div>
            <div style={{ ...st.kpiValue, color: toneColor(k.tone) }}>{k.value}</div>
          </Link>
        ))}
      </div>

      {/* Attention / blockers */}
      <section style={st.attn}>
        <div style={st.attnHead}>
          <span style={{ fontSize: 15 }}>⚡</span>
          <h2 style={st.attnTitle}>Needs attention</h2>
          <span style={st.attnCount}>{digest.blockers.length}</span>
        </div>
        {digest.blockers.length === 0 ? (
          <p style={st.clear}>✓ Nothing is blocking delivery right now.</p>
        ) : (
          <ul style={st.list}>
            {digest.blockers.slice(0, 12).map((b, i) => {
              const body = (
                <>
                  <span style={{ ...st.dot, background: b.severity === 'high' ? 'var(--bad)' : 'var(--accent)' }} />
                  <span style={st.blkIcon}>{b.icon}</span>
                  <span>{b.text}</span>
                  {b.href ? <span style={st.arrow}>→</span> : null}
                </>
              );
              return (
                <li key={i} style={st.item}>
                  {b.href ? (
                    <Link href={b.href} style={st.itemLink}>{body}</Link>
                  ) : (
                    <span style={st.itemLink}>{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Area cards */}
      <h2 style={st.areasTitle}>Areas</h2>
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
                  {breakdown.slice(0, 4).map(([status, cnt]) => (
                    <span key={status} style={st.chip}>
                      {status.replace(/_/g, ' ')} <b>{cnt}</b>
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
  sub: { color: 'var(--muted)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5, maxWidth: 760 } as CSSProperties,
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  kpi: { display: 'block', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--panel)', textDecoration: 'none' } as CSSProperties,
  kpiTop: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--muted)', marginBottom: 8 } as CSSProperties,
  kpiLabel: { textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 } as CSSProperties,
  kpiValue: { fontSize: 22, fontWeight: 800 } as CSSProperties,
  attn: { border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 22, background: 'var(--panel)' } as CSSProperties,
  attnHead: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 } as CSSProperties,
  attnTitle: { fontSize: 14, fontWeight: 700, margin: 0 } as CSSProperties,
  attnCount: { marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--muted)' } as CSSProperties,
  clear: { color: 'var(--good)', fontSize: 13, margin: 0 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 } as CSSProperties,
  item: { borderTop: '1px solid var(--border)' } as CSSProperties,
  itemLink: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', fontSize: 13, color: 'var(--text)', textDecoration: 'none' } as CSSProperties,
  dot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 } as CSSProperties,
  blkIcon: { fontSize: 13 } as CSSProperties,
  arrow: { marginLeft: 'auto', color: 'var(--accent)' } as CSSProperties,
  areasTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
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
