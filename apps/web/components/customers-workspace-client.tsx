'use client';

import { useMemo, type CSSProperties } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AccountsPortfolioClient from './accounts-portfolio-client';
import ContactsClient from './contacts-client';

export type CustomerPortfolioRow = import('./accounts-portfolio-client').PortfolioRow;
export type CustomerContact = {
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
};
export type CustomerAccount = { id: string; name: string };

type View = 'accounts' | 'contacts' | 'stakeholders';

export default function CustomersWorkspaceClient({
  accounts,
  contacts,
  accountOptions,
  currentUserId,
}: {
  accounts: CustomerPortfolioRow[];
  contacts: CustomerContact[];
  accountOptions: CustomerAccount[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('view');
  const view: View = requested === 'contacts' || requested === 'stakeholders' ? requested : 'accounts';

  const setView = (next: View) => router.replace(`${pathname}?view=${next}`, { scroll: false });

  const grouped = useMemo(() => {
    const byAccount = new Map<string, { id: string; name: string; contacts: CustomerContact[] }>();
    for (const contact of contacts) {
      const key = contact.accountId ?? 'unlinked';
      const name = contact.accountName ?? 'Unlinked contacts';
      const group = byAccount.get(key) ?? { id: key, name, contacts: [] };
      group.contacts.push(contact);
      byAccount.set(key, group);
    }
    return [...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  return (
    <div style={st.page}>
      <header style={st.header}>
        <div>
          <div style={st.eyebrow}>CRM · CUSTOMER RELATIONSHIPS</div>
          <h1 style={st.h1}>Customers</h1>
          <p style={st.sub}>
            One workspace for the companies you do business with and the stakeholders who move each relationship forward.
            Open an Account 360 or Contact 360 for the complete record.
          </p>
        </div>
      </header>

      <nav aria-label="Customer views" style={st.tabs}>
        {([
          ['accounts', 'Accounts', accounts.length, 'Commercial accounts, pipeline, delivery and financial exposure'],
          ['contacts', 'Contacts', contacts.length, 'People, roles and relationship strength'],
          ['stakeholders', 'Stakeholder Map', contacts.filter((c) => c.accountId).length, 'Account-to-person relationship coverage'],
        ] as const).map(([key, label, count, description]) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            onClick={() => setView(key)}
            style={{ ...st.tab, ...(view === key ? st.tabActive : {}) }}
            title={description}
          >
            {label} <span style={{ ...st.count, ...(view === key ? st.countActive : {}) }}>{count}</span>
          </button>
        ))}
      </nav>

      {view === 'accounts' ? (
        <AccountsPortfolioClient rows={accounts} currentUserId={currentUserId} />
      ) : view === 'contacts' ? (
        <ContactsClient initialContacts={contacts} initialAccounts={accountOptions} />
      ) : (
        <section aria-label="Stakeholder map" style={st.mapGrid}>
          <div style={st.mapIntro}>
            <h2 style={st.sectionTitle}>Stakeholder Map</h2>
            <p style={st.muted}>See who is connected to each account, their decision role, and relationship strength. Select a person or company to open its 360 view.</p>
          </div>
          {grouped.length === 0 ? <p style={st.muted}>No linked stakeholders yet. Add a contact and link it to an account.</p> : null}
          {grouped.map((group) => (
            <article key={group.id} style={st.accountCard}>
              <div style={st.accountHead}>
                {group.id === 'unlinked' ? <span style={st.accountName}>{group.name}</span> : <a href={`/crm/accounts/${group.id}`} style={st.accountName}>{group.name}</a>}
                <span style={st.contactCount}>{group.contacts.length} {group.contacts.length === 1 ? 'contact' : 'contacts'}</span>
              </div>
              <div style={st.people}>
                {group.contacts.map((contact) => (
                  <a key={contact.id} href={`/crm/contacts/${contact.id}`} style={st.person}>
                    <span style={st.personName}>{contact.name}</span>
                    <span style={st.personMeta}>{contact.jobTitle ?? 'Stakeholder'} · {contact.stakeholderRole ?? 'Role unmapped'}</span>
                    <span style={st.personMeta}>{contact.relationshipStrength ?? 'Relationship unmapped'}{contact.isPrimary ? ' · Primary' : ''}</span>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  header: { marginBottom: 18 } as CSSProperties,
  eyebrow: { color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' as const } as CSSProperties,
  h1: { fontSize: 32, margin: '5px 0 6px', letterSpacing: -0.7 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 780, lineHeight: 1.55 } as CSSProperties,
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 22 } as CSSProperties,
  tab: { border: 'none', borderBottom: '2px solid transparent', background: 'transparent', color: 'var(--muted)', padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as CSSProperties,
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' } as CSSProperties,
  count: { display: 'inline-flex', minWidth: 20, justifyContent: 'center', marginLeft: 5, padding: '2px 6px', borderRadius: 999, background: 'var(--panel)', fontSize: 11 } as CSSProperties,
  countActive: { background: 'var(--accent)', color: '#fff' } as CSSProperties,
  mapGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  mapIntro: { gridColumn: '1 / -1' } as CSSProperties,
  sectionTitle: { margin: 0, fontSize: 21 } as CSSProperties,
  muted: { color: 'var(--muted)', lineHeight: 1.5 } as CSSProperties,
  accountCard: { border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)', padding: 14 } as CSSProperties,
  accountHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 } as CSSProperties,
  accountName: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' } as CSSProperties,
  contactCount: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  people: { display: 'grid', gap: 7 } as CSSProperties,
  person: { display: 'grid', gap: 2, borderTop: '1px solid var(--border)', paddingTop: 8, textDecoration: 'none' } as CSSProperties,
  personName: { color: 'var(--text)', fontWeight: 600, fontSize: 13 } as CSSProperties,
  personMeta: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
};
