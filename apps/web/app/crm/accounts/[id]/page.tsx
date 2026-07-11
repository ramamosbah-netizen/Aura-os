import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Account360Client from '../../../../components/account-360-client';

export const dynamic = 'force-dynamic';

interface Account {
  id: string;
  name: string;
}

/**
 * Account 360 — the customer command center. The Account is the persistent
 * commercial party; every opportunity, tender, quotation, contract and project
 * that flows through it is surfaced here with status and value.
 */
export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getJson<Account>(`/api/crm/accounts/${id}`);

  if (!account) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Account Not Found</h1>
        <a href="/crm/accounts" style={st.link}>← Back to Accounts</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Account" title={account.name} />
      <div style={st.navRow}>
        <a href="/crm/accounts" style={st.link}>← Back to Accounts</a>
      </div>
      <Account360Client accountId={account.id} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
