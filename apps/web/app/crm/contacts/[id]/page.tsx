import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Contact360Client from '../../../../components/contact-360-client';

export const dynamic = 'force-dynamic';

interface Contact { id: string; name: string; }

/**
 * Contact 360 — the stakeholder command center. A contact is a person inside an
 * Account; this page surfaces their role in the buying decision, relationship
 * strength, account hierarchy, the deals they're involved in, and their
 * interaction history.
 */
export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getJson<Contact>(`/api/crm/contacts/${id}`);

  if (!contact) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Contact Not Found</h1>
        <a href="/crm/contacts" style={st.link}>← Back to Contacts</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Contact" title={contact.name} />
      <div style={st.navRow}>
        <a href="/crm/contacts" style={st.link}>← Back to Contacts</a>
      </div>
      <Contact360Client contactId={contact.id} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
