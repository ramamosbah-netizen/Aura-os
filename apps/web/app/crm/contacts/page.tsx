import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import ContactsClient from '../../../components/contacts-client';

export const dynamic = 'force-dynamic';

interface Contact {
  id: string;
  accountId: string | null;
  accountName: string | null;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  stakeholderRole: string | null;
  relationshipStrength: string | null;
  reportsToId: string | null;
  reportsToName: string | null;
  status: string;
  ownerId: string | null;
  createdAt: string;
}
interface Account { id: string; name: string; }

export default async function CrmContactsPage() {
  const [contactsResult, accountsResult] = await Promise.all([
    fetchJson<Contact[]>('/api/crm/contacts'),
    fetchJson<Account[]>('/api/crm/accounts'),
  ]);

  if (!contactsResult.ok) return <DataStateNotice error={contactsResult.error} subject="contacts" />;
  if (!accountsResult.ok) return <DataStateNotice error={accountsResult.error} subject="accounts" />;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Contacts &amp; Stakeholders</h1>
      <p style={st.sub}>
        The people behind every deal — mapped as stakeholders: their role in the buying decision
        (decision maker, influencer, technical, finance…), how strong the relationship is, and who
        they report to. Open any contact for the full stakeholder 360.
      </p>
      <ContactsClient initialContacts={contactsResult.data ?? []} initialAccounts={accountsResult.data ?? []} />
    </div>
  );
}

const st = {
  page: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};
