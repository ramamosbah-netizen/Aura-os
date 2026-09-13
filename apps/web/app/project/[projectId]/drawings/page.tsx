import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DrawingsByProject, { type DrawingRow, type ProjectRef } from '@/components/engineering-drawings-by-project';

export const dynamic = 'force-dynamic';

/**
 * One project's drawing register, reached from inside the project.
 *
 * The list is fetched WITH `projectId` on the query, which is not a convenience: the permission
 * guard reads the project from the route param, body or query to stamp `resource: project:<id>`
 * onto the access target (`core/src/identity/permissions.guard.ts`). A read that carries its
 * project is a read a project-scoped grant can authorise; one that does not falls back to an
 * org-wide grant. So the scoping and the enforcement are the same fact, not two.
 *
 * The API's own filter is used rather than fetching everything and filtering here — filtering in
 * the browser would mean the unauthorised rows were sent before being hidden.
 */
export default async function ProjectDrawingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [drawings, projects] = await Promise.all([
    getJson<DrawingRow[]>(`/api/engineering/drawings?projectId=${encodeURIComponent(projectId)}`),
    getJson<ProjectRef[]>('/api/projects/projects'),
  ]);

  const name = (projects ?? []).find((p) => p.id === projectId)?.title ?? projectId;
  const rows = drawings ?? [];

  return (
    <div>
      <h1 style={st.h1}>
        <span style={{ marginRight: 8 }}>📐</span>Drawings
      </h1>
      <p style={st.sub} data-testid="project-drawings-scope">
        Every shop drawing on <strong>{name}</strong>. The register across all projects is at{' '}
        <a href="/engineering/drawings" style={st.link}>Engineering → Drawing Register</a>.
      </p>

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="project-drawings-empty">
          No drawings on this project yet. Register one from the{' '}
          <a href="/engineering?section=drawings" style={st.link}>Engineering workspace</a>.
        </div>
      ) : (
        <DrawingsByProject drawings={rows} projects={projects ?? []} scopedProjectId={projectId} />
      )}
    </div>
  );
}

const st = {
  h1: { fontSize: 22, margin: '0 0 8px', color: 'var(--accent)', display: 'flex', alignItems: 'center' } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 18px', fontSize: 13, lineHeight: 1.5 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  empty: { border: '1px dashed var(--border)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
};
