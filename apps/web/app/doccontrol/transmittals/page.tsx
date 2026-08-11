import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Transmittal {
  id: string;
  code: string;
  title: string;
  sender: string | null;
  recipient: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', sent: 'Sent', received: 'Received', acknowledged: 'Acknowledged' };

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
  const map: Record<string, CSSProperties> = {
    acknowledged: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    received: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    sent: { background: 'rgba(59,130,246,.12)', color: '#2563eb' },
    draft: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

export default async function TransmittalRegisterPage() {
  const list = (await getJson<Transmittal[]>('/api/doccontrol/transmittals')) ?? [];
  const rows = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/doccontrol/register" style={st.crumbLink}>Document Control</a>
        <span style={st.crumbSep}>/</span>
        <span>Transmittal Register</span>
      </div>
      <h1 style={st.h1}>Transmittal Register</h1>
      <p style={st.sub}>
        Every conveyance of documents to a recipient, at exact revisions. Each transmittal walks
        Draft → Sent → Received → Acknowledged, and the acknowledgement is recorded.
      </p>

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="transmittal-empty">No transmittals yet.</div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="transmittal-register">
            <thead>
              <tr>{['Transmittal', 'Title', 'Sender', 'Recipient', 'Status', 'Sent'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td style={st.tdCode}>{t.code}</td>
                  <td style={st.td}>{t.title}</td>
                  <td style={st.tdMuted}>{t.sender ?? '—'}</td>
                  <td style={st.tdMuted}>{t.recipient ?? '—'}</td>
                  <td style={st.td}><span style={statusStyle(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                  <td style={st.tdMuted}>{fmt(t.sentAt)}</td>
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
};
