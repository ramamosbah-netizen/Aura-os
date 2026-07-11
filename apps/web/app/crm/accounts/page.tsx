import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AccountCreate, { AccountEdit } from '../../../components/account-create';

export const dynamic = 'force-dynamic';

// The HTTP contract shape (web stays decoupled from the @aura/crm package).
interface Account {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  createdAt: string;
}

// The shared Page<T> envelope shape (mirrors @aura/shared pagination).
interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PAGE_SIZE = 50;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  // Frontend opt-in to the paged API (gap #9): fetch one window, not the whole table.
  const pageNo = Math.max(0, Number((await searchParams)?.page ?? 0) || 0);
  const page = await getJson<Page<Account>>(`/api/crm/accounts/paged?limit=${PAGE_SIZE}&offset=${pageNo * PAGE_SIZE}`);
  const accounts = page?.items ?? null;

  return (
    <div style={st.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={st.h1}>CRM · Accounts</h1>
          <p style={st.sub}>
            Customers and prospects — where every deal begins. Accounts flow through the full
            deal chain: CRM → Tender → Contract → Project.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/api/crm/accounts/export/xlsx" style={st.exportBtn}>⤓ Excel</a>
          <a href="/crm/accounts/print" style={st.exportBtn}>🖨 PDF</a>
        </div>
      </div>

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
                {['Name', 'Status', 'Industry', 'Created', ''].map((h, i) => (
                  <th key={i} style={st.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={st.td}>
                    <a
                      href={`/crm/accounts/${a.id}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {a.name}
                    </a>
                  </td>
                  <td style={st.td}>
                    <span style={st.tag}>{a.status}</span>
                  </td>
                  <td style={st.tdMuted}>{a.industry ?? '—'}</td>
                  <td style={st.tdMuted}>{fmt(a.createdAt)}</td>
                  <td style={st.td}>
                    <AccountEdit account={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {page && page.total > PAGE_SIZE ? (
        <div style={st.pager}>
          {pageNo > 0 ? (
            <a style={st.pagerLink} href={`/crm/accounts?page=${pageNo - 1}`}>← Previous</a>
          ) : (
            <span style={st.pagerDisabled}>← Previous</span>
          )}
          <span style={st.pagerInfo}>
            {page.offset + 1}–{page.offset + page.items.length} of {page.total.toLocaleString()}
          </span>
          {page.hasMore ? (
            <a style={st.pagerLink} href={`/crm/accounts?page=${pageNo + 1}`}>Next →</a>
          ) : (
            <span style={st.pagerDisabled}>Next →</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

const st = {
  exportBtn: { border: '1px solid var(--border)', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none', background: 'var(--panel)', whiteSpace: 'nowrap' } as CSSProperties,
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
  pager: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 14 } as CSSProperties,
  pagerLink: {
    color: 'var(--accent)',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 14px',
  } as CSSProperties,
  pagerDisabled: {
    color: 'var(--muted)',
    opacity: 0.5,
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 14px',
  } as CSSProperties,
  pagerInfo: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
};
