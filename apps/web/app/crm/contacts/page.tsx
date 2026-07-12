import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
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
  const [contacts, accounts] = await Promise.all([
    getJson<Contact[]>('/api/crm/contacts'),
    getJson<Account[]>('/api/crm/accounts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Contacts &amp; Stakeholders</h1>
      <p style={st.sub}>
        The people behind every deal — mapped as stakeholders: their role in the buying decision
        (decision maker, influencer, technical, finance…), how strong the relationship is, and who
        they report to. Open any contact for the full stakeholder 360.
      </p>
      <ContactsClient initialContacts={contacts ?? []} initialAccounts={accounts ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 740, lineHeight: 1.5 } as CSSProperties,
};
