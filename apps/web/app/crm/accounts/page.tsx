import type { CSSProperties } from 'react';
import { getJson } from '../../../lib/api';
import AccountCreate from '../../../components/account-create';

export const dynamic = 'force-dynamic';

// The HTTP contract shape (web stays decoupled from the @aura/crm package).
interface Account {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  createdAt: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function AccountsPage() {
  const accounts = await getJson<Account[]>('/api/crm/accounts');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Accounts</h1>
      <p style={st.sub}>
        Customers and prospects — the head of the deal chain (CRM → Tender → Contract → Project).
        Creating one emits <code style={st.code}>crm.account.created</code> on the spine.
      </p>

      <AccountCreate />

      <section style={st.panel}>
        {accounts === null ? (
          <p style={st.muted}>API offline.</p>
        ) : accounts.length === 0 ? (
          <p style={st.muted}>No accounts yet — add one above.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Name', 'Status', 'Industry', 'Created'].map((h) => (
                  <th key={h} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={st.td}>{a.name}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{a.status}</span>
                  </td>
                  <td style={st.tdMuted}>{a.industry ?? '—'}</td>
                  <td style={st.tdMuted}>{fmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tag: {
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
    textTransform: 'capitalize',
  } as CSSProperties,
};
