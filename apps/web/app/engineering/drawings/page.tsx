import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DrawingRegisterTable from '@/components/drawing-register-table';

export const dynamic = 'force-dynamic';

interface Drawing {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  revision: string;
  status: string;
  discipline: string;
  previousRevision: string | null;
  updatedAt: string;
}

export default async function DrawingRegisterPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const [{ projectId }, data] = await Promise.all([
    searchParams,
    getJson<Drawing[]>('/api/engineering/drawings'),
  ]);
  const drawings = projectId ? (data ?? []).filter((drawing) => drawing.projectId === projectId) : (data ?? []);
  // Register view: the live drawings first, superseded revisions sink to the bottom.
  const rank = (s: string): number => (s === 'superseded' ? 1 : s === 'closed' ? 0.5 : 0);
  const rows = [...drawings].sort((a, b) => rank(a.status) - rank(b.status) || a.code.localeCompare(b.code));

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/engineering" style={st.crumbLink}>Engineering</a>
        <span style={st.crumbSep}>/</span>
        <span>Drawing Register</span>
      </div>
      <h1 style={st.h1}>Drawing Register</h1>
      <p style={st.sub}>
        The controlled register of every shop drawing and its current revision. Each drawing walks a
        governed lifecycle — Draft → Submitted → Under Review → Approved / Rejected → Transmitted →
        Closed — and every transition is recorded. Open a drawing to drive its workflow.
      </p>

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="register-empty">
          No drawings yet. Create one from the <a href="/engineering" style={st.crumbLink}>Engineering</a> workspace.
        </div>
      ) : (
        <DrawingRegisterTable rows={rows} />
      )}
    </div>
  );
}

const st = {
  // Full width, matching /engineering — the register is a wide table and this page sat in a
  // 1080px column with empty screen on both sides, which is the thing that was already fixed on
  // the workspace it belongs to. `sub` keeps its own measure so the description stays readable.
  page: { padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
};
