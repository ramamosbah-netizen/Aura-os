import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import { ProjectAreaRegister } from '@/components/project-area-register';
import { filterAreaRows, findArea } from '@/lib/project-areas';
import styles from './project-area-workspace.module.css';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown> & { id?: string; projectId?: string };

export default async function ProjectAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; area: string }>;
  searchParams: Promise<{ discipline?: string }>;
}) {
  const [{ projectId, area: slug }, query] = await Promise.all([params, searchParams]);
  const area = findArea(slug);
  if (!area) notFound();

  const result = await fetchJson<Row[]>(area.endpoint);
  if (!result.ok) return <DataStateNotice error={result.error} subject={`${area.label.toLowerCase()} records`} />;
  const projectRows = (Array.isArray(result.data) ? result.data : []).filter((r) => r.projectId === projectId);
  const rows = filterAreaRows(projectRows, query.discipline);
  const openCount = rows.filter((row) => /open|pending|in_progress|overdue|draft|failed/i.test(String(row[area.statusKey] ?? ''))).length;
  const lastUpdated = rows
    .map((row) => String(row.updatedAt ?? row.createdAt ?? row.date ?? ''))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  return (
    <main className={styles.page} data-testid={`project-area-${area.slug}`}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>PROJECT 360 / {area.label.toUpperCase()}</div>
          <h1><span aria-hidden>{area.icon}</span>{area.label}</h1>
          <p>{area.description}</p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.contextBadge}>Project context</span>
          <span className={styles.contextValue}>{rows.length} {area.entity}{rows.length === 1 ? '' : 's'}</span>
        </div>
      </header>

      <section className={styles.metricGrid} aria-label={`${area.label} summary`}>
        <article className={styles.metric}><span>Connected records</span><strong>{rows.length}</strong><small>scoped to this project</small></article>
        <article className={styles.metric}><span>Open / active</span><strong>{openCount}</strong><small>derived from canonical status</small></article>
        <article className={styles.metric}><span>Last update</span><strong>{lastUpdated ? new Date(lastUpdated).toLocaleDateString('en-AE', { day: '2-digit', month: 'short' }) : '—'}</strong><small>{lastUpdated ? 'from source record' : 'not established'}</small></article>
      </section>

      <section className={styles.actionPanel} aria-label={`${area.label} actions`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.kicker}>WORKSPACE ACTIONS</span><h2>Move {area.label.toLowerCase()} forward</h2></div>
          <span className={styles.hint}>Actions open the canonical owner with this project context.</span>
        </div>
        <div className={styles.actionGrid}>
          {area.actions.map((action) => (
            <a key={action.label} href={`${action.href}?projectId=${encodeURIComponent(projectId)}`} className={styles.actionCard}>
              <strong>{action.label}</strong><span>{action.description}</span><span className={styles.arrow}>→</span>
            </a>
          ))}
        </div>
      </section>

      {query.discipline ? (
        <p className={styles.scopeNote}>System lens is active. Project-wide records remain visible alongside matching system records.</p>
      ) : null}

      <ProjectAreaRegister
        areaLabel={area.label}
        entity={area.entity}
        columns={area.columns}
        rows={rows}
        rowHref={area.rowHref}
        statusKey={area.statusKey}
      />
    </main>
  );
}
