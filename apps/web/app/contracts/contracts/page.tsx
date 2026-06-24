import type { CSSProperties } from 'react';
import { getJson } from '../../../lib/api';
import ContractCreate from '../../../components/contract-create';

export const dynamic = 'force-dynamic';

interface Contract {
  id: string;
  title: string;
  tenderTitle: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface WonTender {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

function money(n: number): string {
  return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default async function ContractsPage() {
  // The deal chain composing through the contract: contracts from our own API, and the
  // "from won tender" options from the Tendering API (filtered to status=won) — each won
  // tender already carries its CRM account snapshot, so a contract inherits both.
  const [contracts, wonTenders] = await Promise.all([
    getJson<Contract[]>('/api/contracts/contracts'),
    getJson<WonTender[]>('/api/tendering/tenders?status=won'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Contracts</h1>
      <p style={st.sub}>
        Awarded engagements — the third link in the deal chain. A contract is raised from a{' '}
        <strong>won tender</strong>, inheriting its account + value, and emits{' '}
        <code style={st.code}>contracts.contract.created</code> on the spine.
      </p>

      <ContractCreate
        tenders={(wonTenders ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          accountId: t.accountId,
          accountName: t.accountName,
          value: t.value,
        }))}
      />

      <section style={st.panel}>
        {contracts === null ? (
          <p style={st.muted}>API offline.</p>
        ) : contracts.length === 0 ? (
          <p style={st.muted}>No contracts yet — raise one from a won tender above.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Title', 'From tender', 'Account', 'Status', 'Value', 'Created'].map((h) => (
                  <th key={h} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td style={st.td}>{c.title}</td>
                  <td style={st.tdMuted}>{c.tenderTitle ?? '—'}</td>
                  <td style={st.tdMuted}>{c.accountName ?? '—'}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{c.status}</span>
                  </td>
                  <td style={st.td}>{money(c.value)}</td>
                  <td style={st.tdMuted}>{fmt(c.createdAt)}</td>
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
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 660, lineHeight: 1.5 } as CSSProperties,
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
