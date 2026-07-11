'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';
import ExportButton from './export-button';

// CRM · Contacts — the PEOPLE at each commercial party. A contact hangs off its
// Account (reference + name snapshot); each account has at most one ★ primary
// contact, which the Account 360 header surfaces as the main contact.

interface Contact {
  id: string;
  accountId: string | null;
  accountName: string | null;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  status: string;
  ownerId: string | null;
  createdAt: string;
}
interface Account { id: string; name: string; }

const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default function ContactsClient({ initialContacts, initialAccounts }: {
  initialContacts: Contact[];
  initialAccounts: Account[];
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  const contacts = useMemo(() => {
    let out = initialContacts;
    if (accountFilter) out = out.filter((c) => c.accountId === accountFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((c) =>
        [c.name, c.jobTitle, c.email, c.phone, c.accountName].some((v) => v && v.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [initialContacts, query, accountFilter]);

  const kpi = useMemo(() => {
    const all = initialContacts;
    const active = all.filter((c) => c.status === 'active');
    const linked = all.filter((c) => c.accountId);
    const primaries = all.filter((c) => c.isPrimary && c.status === 'active');
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const recent = all.filter((c) => c.createdAt >= monthAgo);
    const accountsWithContact = new Set(linked.map((c) => c.accountId));
    const uncovered = initialAccounts.filter((a) => !accountsWithContact.has(a.id)).length;
    return { total: all.length, active: active.length, linked: linked.length, primaries: primaries.length, recent: recent.length, uncovered };
  }, [initialContacts, initialAccounts]);

  const patch = async (c: Contact, body: Record<string, unknown>, note?: string): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/crm/contacts/${c.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Update failed'); return; }
      if (note) setMsg(note);
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  const accountOptions = initialAccounts.map((a) => ({ value: a.id, label: a.name }));
  const accountName = (c: Contact): string =>
    c.accountName ?? initialAccounts.find((a) => a.id === c.accountId)?.name ?? 'Account';

  const drawerFields = (forEdit: boolean) => [
    { name: 'name', label: 'Full name', kind: 'text' as const, required: true, placeholder: 'e.g. Khalid Mansoor', span: 2 as const },
    { name: 'jobTitle', label: 'Job title', kind: 'text' as const, placeholder: 'e.g. Procurement Manager' },
    {
      name: 'accountId', label: 'Account', kind: 'select' as const, labelField: 'accountName',
      placeholder: 'No linked account', options: accountOptions,
    },
    { name: 'email', label: 'Email', kind: 'text' as const, placeholder: 'name@company.com' },
    { name: 'phone', label: 'Phone', kind: 'text' as const, placeholder: '+971 …' },
    ...(forEdit ? [] : [{ name: 'ownerId', label: 'Owner', kind: 'text' as const, placeholder: 'e.g. u-sales' }]),
  ];

  return (
    <>
      {/* KPI strip */}
      <div style={st.cards}>
        <Kpi label="Total contacts" value={String(kpi.total)} />
        <Kpi label="Active" value={String(kpi.active)} good />
        <Kpi label="Linked to accounts" value={`${kpi.linked}/${kpi.total}`} />
        <Kpi label="Primary contacts" value={String(kpi.primaries)} accent />
        <Kpi label="Accounts w/o contact" value={String(kpi.uncovered)} bad={kpi.uncovered > 0} />
        <Kpi label="Added last 30 days" value={String(kpi.recent)} />
      </div>

      {/* toolbar */}
      <div style={st.toolbar}>
        <CreateDrawer
          entity="Contact"
          subtitle="A person at a customer/prospect account — the account's people directory feeds the Account 360."
          endpoint="/api/crm/contacts"
          fields={drawerFields(false)}
        />
        <input
          style={st.search}
          placeholder="Search name, title, email, account…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={st.search} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ExportButton filename="contacts" rows={contacts as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'name' }, { key: 'jobTitle' }, { key: 'accountName' }, { key: 'email' }, { key: 'phone' }, { key: 'isPrimary' }, { key: 'status' }, { key: 'ownerId' }]} />
        {err && <span style={st.err}>{err}</span>}
        {msg && <span style={st.ok}>{msg}</span>}
      </div>

      {contacts.length === 0 ? (
        <p style={st.muted}>
          {initialContacts.length === 0
            ? 'No contacts yet — add the people you deal with at each account.'
            : 'No contacts match the filter.'}
        </p>
      ) : (
        <section className="panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 980 }}>
              <thead><tr>
                <th style={{ width: 40 }}>★</th><th>Name</th><th>Job title</th><th>Account</th>
                <th>Email</th><th>Phone</th><th>Status</th><th>Owner</th><th>Added</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} style={c.status === 'inactive' ? { opacity: 0.55 } : undefined}>
                    <td>
                      <button
                        type="button"
                        style={{ ...st.starBtn, color: c.isPrimary ? 'var(--accent)' : 'var(--muted)' }}
                        title={c.isPrimary ? 'Primary contact for the account' : 'Make primary contact (demotes the current one)'}
                        disabled={busy || !c.accountId}
                        onClick={() => void patch(c, { isPrimary: !c.isPrimary }, c.isPrimary ? undefined : `${c.name} is now the primary contact for ${c.accountName}.`)}
                      >
                        {c.isPrimary ? '★' : '☆'}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.jobTitle ?? '—'}</td>
                    <td>
                      {c.accountId
                        ? <a href={`/crm/accounts/${c.accountId}`} style={st.link}>{accountName(c)}</a>
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td>{c.email ? <a href={`mailto:${c.email}`} style={st.link}>{c.email}</a> : '—'}</td>
                    <td>{c.phone ? <a href={`tel:${c.phone}`} style={st.link}>{c.phone}</a> : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className={c.status === 'active' ? 'badge badge-good' : 'badge'}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="Toggle active / inactive"
                        disabled={busy}
                        onClick={() => void patch(c, { status: c.status === 'active' ? 'inactive' : 'active' })}
                      >
                        {c.status}
                      </button>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{c.ownerId ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(c.createdAt)}</td>
                    <td>
                      <CreateDrawer
                        entity="Contact"
                        subtitle="Update this person's details."
                        endpoint={`/api/crm/contacts/${c.id}`}
                        mode="edit"
                        fields={drawerFields(true)}
                        initialValues={{
                          name: c.name,
                          jobTitle: c.jobTitle ?? '',
                          accountId: c.accountId ?? '',
                          email: c.email ?? '',
                          phone: c.phone ?? '',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}), ...(bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
    </div>
  );
}

const st = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  search: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', minWidth: 180 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 } as CSSProperties,
  starBtn: { background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 } as CSSProperties,
};
