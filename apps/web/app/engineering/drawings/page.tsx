import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DrawingsByProject, { type DrawingRow, type ProjectRef } from '@/components/engineering-drawings-by-project';

export const dynamic = 'force-dynamic';

/**
 * The GLOBAL drawing register.
 *
 * Project-centric navigation does not abolish this page — an engineering manager asking "what is
 * waiting for approval across all my projects" is asking a question no single project can answer.
 * What changed is the shape: it groups by project like the workspace panel does, using the same
 * component, because two views of one register had already drifted (this one had no way to reach a
 * document at all).
 *
 * Every row here leads INTO the project: the drawing links to `/project/{projectId}/drawings/{id}`,
 * which is the route shape the permission guard can read a project out of before the record is
 * loaded. This page is where you find a drawing; the project is where you work on it.
 */
export default async function DrawingRegisterPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const [{ projectId }, data, projects] = await Promise.all([
    searchParams,
    getJson<DrawingRow[]>('/api/engineering/drawings'),
    getJson<ProjectRef[]>('/api/projects/projects'),
  ]);
  const drawings = projectId ? (data ?? []).filter((d) => d.projectId === projectId) : (data ?? []);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/engineering" style={st.crumbLink}>Engineering</a>
        <span style={st.crumbSep}>/</span>
        <span>Drawing Register</span>
      </div>
      <h1 style={st.h1}>Drawing Register</h1>
      <p style={st.sub}>
        Every shop drawing on every project, grouped by the project that owns it. Each drawing walks
        a governed lifecycle — Draft → Submitted → Under Review → Approved / Rejected → Transmitted
        → Closed — and every transition is recorded. Open a project to work inside it.
      </p>

      {drawings.length === 0 ? (
        <div style={st.empty} data-testid="register-empty">
          No drawings yet. Create one from the <a href="/engineering" style={st.crumbLink}>Engineering</a> workspace.
        </div>
      ) : (
        <DrawingsByProject drawings={drawings} projects={projects ?? []} scopedProjectId={projectId ?? null} />
      )}
    </div>
  );
}

const st = {
  // Full width, matching /engineering — the register is a wide table and this page sat in a
  // 1080px column with empty screen on both sides. `sub` keeps its own measure so it stays readable.
  page: { padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
};
