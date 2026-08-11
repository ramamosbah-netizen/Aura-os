import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

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
    approved: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    transmitted: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    closed: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
    superseded: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
    rejected: { background: 'rgba(239,68,68,.15)', color: '#dc2626' },
    revision_required: { background: 'rgba(245,158,11,.16)', color: '#d97706' },
    under_review: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    submitted: { background: 'rgba(59,130,246,.12)', color: '#2563eb' },
    draft: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}

export default async function DrawingRegisterPage() {
  const drawings = (await getJson<Drawing[]>('/api/engineering/drawings')) ?? [];
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
              {rows.map((d) => (
                <tr key={d.id} style={d.status === 'superseded' ? st.rowMuted : undefined}>
                  <td style={st.tdCode}>{d.code}</td>
                  <td style={st.tdMuted}>{d.revision}</td>
                  <td style={st.td}>{d.title}</td>
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
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  rowMuted: { opacity: 0.55 } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
