import type { CSSProperties } from 'react';
import { currentUser, fetchJson } from '@/lib/api';
import DataStateNotice from '../../../../components/ui/data-state';
import RecordChrome from '../../../../components/record-chrome';
import RecordCorrespondence from '../../../../components/record-correspondence';
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
  const result = await fetchJson<Account>(`/api/crm/accounts/${id}`);

  if (!result.ok) {
    if (result.error.kind !== 'not-found') {
      return <div style={st.container}><DataStateNotice error={result.error} subject="this account" /></div>;
    }
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Account Not Found</h1>
        <a href="/crm/customers?view=accounts" style={st.link}>← Back to Customers</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Account" title={result.data.name} />
      <RecordCorrespondence recordType="crm.account" recordId={result.data.id} label={result.data.name} />
      <div style={st.navRow}>
        <a href="/crm/customers?view=accounts" style={st.link}>← Back to Customers</a>
      </div>
      {/* "me" is the signed-in person — the session `sub`, which is what the API records as an
          owner. /workspace/me is refused to every shipped role (measured), so it cannot be it. */}
      <Account360Client accountId={result.data.id} currentUserId={(await currentUser())?.sub ?? null} />
    </div>
  );
}

const st = {
  container: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
