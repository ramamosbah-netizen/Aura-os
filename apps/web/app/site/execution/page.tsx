import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface DailyReport {
  id: string;
  reportNumber: string;
  projectName: string | null;
  projectId: string;
  date: string;
  status: string;
  preparedBy: string | null;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected',
};
function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    approved: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    under_review: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    submitted: { background: 'rgba(59,130,246,.12)', color: '#2563eb' },
    rejected: { background: 'rgba(239,68,68,.15)', color: '#dc2626' },
    draft: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default async function SiteExecutionPage() {
  const reports = (await getJson<DailyReport[]>('/api/site/daily-reports')) ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = reports.filter((r) => new Date(r.date).getTime() >= weekAgo).length;
  const approved = reports.filter((r) => r.status === 'approved').length;
  const pending = reports.filter((r) => r.status === 'submitted' || r.status === 'under_review').length;
  const rejected = reports.filter((r) => r.status === 'rejected').length;
  const rows = [...reports].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site Execution</h1>
      <p style={st.sub}>
        The governed site diary: one daily report per project-day tying together manpower, plant,
        installation progress, delays and photo evidence — through Draft → Submitted → Under Review →
        Approved, with an immutable audit trail.
      </p>

      <div style={st.kpis}>
        <Kpi label="Reports this week" value={thisWeek} />
        <Kpi label="Approved" value={approved} tone="good" />
        <Kpi label="Pending review" value={pending} tone="info" />
        <Kpi label="Rejected" value={rejected} tone={rejected ? 'bad' : undefined} />
      </div>

      <h2 style={st.h2}>Daily Reports</h2>
      {rows.length === 0 ? (
        <div style={st.empty} data-testid="reports-empty">No daily reports yet.</div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="reports-table">
            <thead>
              <tr>{['Report', 'Project', 'Date', 'Prepared by', 'Status', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={st.tdCode}>{r.reportNumber}</td>
                  <td style={st.td}>{r.projectName ?? r.projectId}</td>
                  <td style={st.tdMuted}>{r.date}</td>
                  <td style={st.tdMuted}>{r.preparedBy ?? '—'}</td>
                  <td style={st.td}><span style={statusStyle(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td style={st.td}><a href={`/site/execution/${r.id}`} style={st.open} data-testid={`open-${r.reportNumber}`}>Open →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'info' }) {
  const color = tone === 'good' ? '#16a34a' : tone === 'bad' ? '#dc2626' : tone === 'info' ? '#2563eb' : 'inherit';
  return (
    <div style={st.kpi}>
      <div style={{ ...st.kpiValue, color }}>{value}</div>
      <div style={st.kpiLabel}>{label}</div>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 } as CSSProperties,
  kpi: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '16px 18px' } as CSSProperties,
  kpiValue: { fontSize: 30, fontWeight: 700, letterSpacing: -1 } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 13, marginTop: 2 } as CSSProperties,
  h2: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
