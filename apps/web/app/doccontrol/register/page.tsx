import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface RegisterEntry {
  id: string;
  documentNumber: string;
  title: string;
  discipline: string;
  docType: string;
  currentRevision: string;
  status: string;
  custodian: string | null;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', for_review: 'For Review', for_construction: 'For Construction', superseded: 'Superseded', as_built: 'As-Built',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    for_construction: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    as_built: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    for_review: { background: 'rgba(59,130,246,.14)', color: '#2563eb' },
    superseded: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
    draft: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}

const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default async function DocumentRegisterPage() {
  const entries = (await getJson<RegisterEntry[]>('/api/doccontrol/register')) ?? [];
  const rows = [...entries].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/doccontrol/submittals" style={st.crumbLink}>Document Control</a>
        <span style={st.crumbSep}>/</span>
        <span>Document Register</span>
      </div>
      <h1 style={st.h1}>Document Register</h1>
      <p style={st.sub}>
        The controlled register of every drawing and document on the project. Each document walks a
        governed lifecycle — Draft → Submitted → Under Review → Approved → Issued → Superseded — with
        immutable revision history. Open a document to drive its approval workflow.
      </p>

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="register-empty">No documents yet.</div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="document-register">
            <thead>
              <tr>{['Document', 'Title', 'Rev', 'Discipline', 'Status', 'Custodian', 'Updated', ''].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={st.tdCode}>{d.documentNumber}</td>
                  <td style={st.td}>{d.title}</td>
                  <td style={st.tdMuted}>{d.currentRevision}</td>
                  <td style={st.tdMuted}>{d.discipline}</td>
                  <td style={st.td}><span style={statusStyle(d.status)}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                  <td style={st.tdMuted}>{d.custodian ?? '—'}</td>
                  <td style={st.tdMuted}>{fmt(d.updatedAt)}</td>
                  <td style={st.td}><a href={`/doccontrol/register/${d.id}`} style={st.open} data-testid={`open-${d.documentNumber}`}>Open →</a></td>
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
  page: { maxWidth: 1120, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
