import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TenderCreate, { TenderEdit } from '../../../components/tender-create';

export const dynamic = 'force-dynamic';

interface Tender {
  id: string;
  title: string;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface AccountLite {
  id: string;
  name: string;
}

function money(n: number): string {
  return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default async function TendersPage() {
  const [tenders, accounts] = await Promise.all([
    getJson<Tender[]>('/api/tendering/tenders'),
    getJson<AccountLite[]>('/api/crm/accounts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Tendering · Tenders</h1>
      <p style={st.sub}>
        Bids and proposals — the second link in the deal chain. Each can reference a CRM account
        (by id + snapshot) and emits <code style={st.code}>tendering.tender.created</code> on the spine.
      </p>

      <TenderCreate accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))} />

      <section style={st.panel}>
        {tenders === null ? (
          <p style={st.muted}>API offline.</p>
        ) : tenders.length === 0 ? (
          <p style={st.muted}>No tenders yet — add one above.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>
                {['Title', 'Account', 'Status', 'Value', 'Created', ''].map((h, i) => (
                  <th key={i} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenders.map((t) => (
                <tr key={t.id}>
                  <td style={st.td}>
                    <a href={`/tendering/tenders/${t.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                      {t.title}
                    </a>
                  </td>
                  <td style={st.tdMuted}>{t.accountName ?? '—'}</td>
                  <td style={st.td}>
                    <span style={st.tag}>{t.status}</span>
                  </td>
                  <td style={st.td}>{money(t.value)}</td>
                  <td style={st.tdMuted}>{fmt(t.createdAt)}</td>
                  <td style={st.td}>
                    <TenderEdit tender={t} />
                  </td>
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
