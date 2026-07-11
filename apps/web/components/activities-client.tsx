'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CreateDrawer from './ui/create-drawer';
import ExportButton from './export-button';

// CRM · Activities — every interaction and to-do on the deal chain (call, email,
// meeting, note, task), agenda-grouped by urgency: Overdue → Today → This week →
// Later → No due date. Each activity links to the record it's about.

interface Activity {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  relatedType: string | null;
  relatedId: string | null;
  relatedName: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  assigneeId: string | null;
  createdAt: string;
}
interface Account { id: string; name: string; }
interface Contact { id: string; name: string; accountName: string | null; }
interface Opportunity { id: string; title: string; }

const TYPE_GLYPH: Record<string, string> = { call: '☎', email: '✉', meeting: '👥', note: '✎', task: '☑' };
const RELATED_HREF: Record<string, (id: string) => string> = {
  account: (id) => `/crm/accounts/${id}`,
  contact: () => '/crm/contacts',
  opportunity: () => '/crm/leads',
  lead: () => '/crm/leads',
  quotation: () => '/crm/quotations',
};

const fmt = (iso: string): string => new Date(iso).toLocaleDateString();

export default function ActivitiesClient({ initialActivities, accounts, contacts, opportunities }: {
  initialActivities: Activity[];
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
}) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const kpi = useMemo(() => {
    const open = initialActivities.filter((a) => a.status === 'open');
    const overdue = open.filter((a) => a.dueDate && a.dueDate < today);
    const dueToday = open.filter((a) => a.dueDate === today);
    const dueWeek = open.filter((a) => a.dueDate && a.dueDate > today && a.dueDate <= weekEnd);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const done30 = initialActivities.filter((a) => a.status === 'completed' && (a.completedAt ?? a.createdAt) >= monthAgo);
    return { open: open.length, overdue: overdue.length, dueToday: dueToday.length, dueWeek: dueWeek.length, done30: done30.length };
  }, [initialActivities, today, weekEnd]);

  const filtered = useMemo(() => {
    let out = initialActivities;
    if (!showClosed) out = out.filter((a) => a.status === 'open');
    if (typeFilter) out = out.filter((a) => a.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((a) => [a.subject, a.notes, a.relatedName, a.assigneeId].some((v) => v && v.toLowerCase().includes(q)));
    return out;
  }, [initialActivities, showClosed, typeFilter, query]);

  /** Agenda buckets in display order. */
  const groups = useMemo(() => {
    const buckets: Array<{ key: string; label: string; tone?: 'bad' | 'accent'; items: Activity[] }> = [
      { key: 'overdue', label: 'Overdue', tone: 'bad', items: [] },
      { key: 'today', label: 'Today', tone: 'accent', items: [] },
      { key: 'week', label: 'This week', items: [] },
      { key: 'later', label: 'Later', items: [] },
      { key: 'nodate', label: 'No due date', items: [] },
      { key: 'closed', label: 'Completed / cancelled', items: [] },
    ];
    for (const a of filtered) {
      if (a.status !== 'open') buckets[5].items.push(a);
      else if (!a.dueDate) buckets[4].items.push(a);
      else if (a.dueDate < today) buckets[0].items.push(a);
      else if (a.dueDate === today) buckets[1].items.push(a);
      else if (a.dueDate <= weekEnd) buckets[2].items.push(a);
      else buckets[3].items.push(a);
    }
    const byDue = (x: Activity, y: Activity) => (x.dueDate ?? '9999') < (y.dueDate ?? '9999') ? -1 : 1;
    buckets.forEach((b) => b.items.sort(byDue));
    return buckets.filter((b) => b.items.length > 0);
  }, [filtered, today, weekEnd]);

  const act = async (a: Activity, action: 'complete' | 'cancel' | 'reopen'): Promise<void> => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/crm/activities/${a.id}/${action}`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Action failed'); return; }
      router.refresh();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  // "Related to" select: one list across the chain; picking an option also fills
  // relatedType + relatedName into the payload via the option's `extra` keys.
  const relatedOptions = [
    ...accounts.map((a) => ({ value: a.id, label: `◆ ${a.name}`, extra: { relatedType: 'account', relatedName: a.name } })),
    ...contacts.map((c) => ({ value: c.id, label: `☎ ${c.name}${c.accountName ? ` (${c.accountName})` : ''}`, extra: { relatedType: 'contact', relatedName: c.name } })),
    ...opportunities.map((o) => ({ value: o.id, label: `◎ ${o.title}`, extra: { relatedType: 'opportunity', relatedName: o.title } })),
  ];

  return (
    <>
      <div style={st.cards}>
        <Kpi label="Open" value={String(kpi.open)} />
        <Kpi label="Overdue" value={String(kpi.overdue)} bad={kpi.overdue > 0} />
        <Kpi label="Due today" value={String(kpi.dueToday)} accent />
        <Kpi label="Due this week" value={String(kpi.dueWeek)} />
        <Kpi label="Completed (30d)" value={String(kpi.done30)} good />
      </div>

      <div style={st.toolbar}>
        <CreateDrawer
          entity="Activity"
          subtitle="Log an interaction or plan a to-do — attach it to the account, contact or deal it's about."
          endpoint="/api/crm/activities"
          fields={[
            {
              name: 'type', label: 'Type', kind: 'select', defaultValue: 'task',
              options: ['call', 'email', 'meeting', 'note', 'task'].map((t) => ({ value: t, label: `${TYPE_GLYPH[t]} ${t}` })),
            },
            { name: 'subject', label: 'Subject', kind: 'text', required: true, placeholder: 'e.g. Follow up on QT-2026-001', span: 2 },
            { name: 'relatedId', label: 'Related to', kind: 'select', placeholder: 'Nothing linked', options: relatedOptions },
            { name: 'dueDate', label: 'Due date', kind: 'date' },
            { name: 'assigneeId', label: 'Assignee', kind: 'text', placeholder: 'e.g. u-sales' },
            { name: 'notes', label: 'Notes', kind: 'textarea', placeholder: 'What happened / what to do…', span: 2 },
          ]}
        />
        <input style={st.search} placeholder="Search subject, notes, related…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select style={st.search} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {['call', 'email', 'meeting', 'note', 'task'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> show closed
        </label>
        <ExportButton filename="activities" rows={filtered as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'type' }, { key: 'subject' }, { key: 'relatedName' }, { key: 'assigneeId' }, { key: 'dueDate' }, { key: 'status' }]} />
        {err && <span style={st.err}>{err}</span>}
      </div>

      {groups.length === 0 && (
        <p style={st.muted}>
          {initialActivities.length === 0 ? 'Nothing logged yet — every call, meeting and task lives here.' : 'Nothing matches the filter.'}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="panel" style={{ marginBottom: 14 }}>
          <div style={{ ...st.groupHead, color: g.tone === 'bad' ? 'var(--bad)' : g.tone === 'accent' ? 'var(--accent)' : 'var(--muted)' }}>
            {g.label} <span style={st.groupCount}>{g.items.length}</span>
          </div>
          <table className="data-table">
            <tbody>
              {g.items.map((a) => (
                <tr key={a.id} style={a.status !== 'open' ? { opacity: 0.55 } : undefined}>
                  <td style={{ width: 90 }}><span style={st.typeTag}>{TYPE_GLYPH[a.type] ?? '·'} {a.type}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.subject}</div>
                    {a.notes && <div style={st.notes}>{a.notes}</div>}
                  </td>
                  <td style={{ width: 220 }}>
                    {a.relatedType && a.relatedId
                      ? <a href={RELATED_HREF[a.relatedType]?.(a.relatedId) ?? '#'} style={st.link}>{a.relatedName ?? a.relatedType}</a>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ width: 110, color: 'var(--muted)' }}>{a.assigneeId ?? '—'}</td>
                  <td style={{ width: 110, color: g.key === 'overdue' ? 'var(--bad)' : 'var(--muted)', fontWeight: g.key === 'overdue' ? 700 : 400 }}>
                    {a.dueDate ? fmt(a.dueDate) : '—'}
                  </td>
                  <td style={{ width: 200, whiteSpace: 'nowrap' }}>
                    {a.status === 'open' && (
                      <>
                        <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy} onClick={() => void act(a, 'complete')}>✓ Done</button>
                        <button type="button" className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy} onClick={() => void act(a, 'cancel')}>Cancel</button>
                      </>
                    )}
                    {a.status !== 'open' && (
                      <>
                        <span className={a.status === 'completed' ? 'badge badge-good' : 'badge badge-bad'}>{a.status}</span>
                        <button type="button" className="btn btn-ghost" style={{ ...st.smBtn, marginLeft: 6 }} disabled={busy} onClick={() => void act(a, 'reopen')}>↺ Reopen</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
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
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  search: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, outline: 'none', minWidth: 170 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 } as CSSProperties,
  groupHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, padding: '10px 12px 4px' } as CSSProperties,
  groupCount: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 7px', fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  typeTag: { fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', textTransform: 'capitalize' } as CSSProperties,
  notes: { fontSize: 12, color: 'var(--muted)', marginTop: 2, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  smBtn: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
};
