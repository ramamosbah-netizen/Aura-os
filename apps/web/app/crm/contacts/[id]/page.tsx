import type { CSSProperties } from 'react';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '../../../../components/ui/data-state';
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
  const result = await fetchJson<Contact>(`/api/crm/contacts/${id}`);

  if (!result.ok) {
    if (result.error.kind !== 'not-found') {
      return <div style={st.container}><DataStateNotice error={result.error} subject="this contact" /></div>;
    }
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Contact Not Found</h1>
        <a href="/crm/customers?view=contacts" style={st.link}>← Back to Customers</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Contact" title={result.data.name} />
      <div style={st.navRow}>
        <a href="/crm/customers?view=contacts" style={st.link}>← Back to Customers</a>
      </div>
      <Contact360Client contactId={result.data.id} />
    </div>
  );
}

const st = {
  container: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
