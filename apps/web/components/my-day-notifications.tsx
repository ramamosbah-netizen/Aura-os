'use client';

import { type CSSProperties, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// "What happened while you were away" — the third thing arriving at the user that
// My Day never showed. Events fire across the whole platform (tender won, lead
// converted, IPC certified) and the only place to see them was /workspace.
//
// Read state is dismissible in place, like the task rows: acknowledging news
// must not cost the view you are reading it in.

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  /** Namespaced origin, e.g. "crm.lead" / "tendering.tender". */
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: string | null;
}

// Only record routes that actually exist are mapped. An unmapped refType renders
// as plain text rather than a link — a 404 from My Day would be worse than no link.
// contracts.ipc is deliberately absent: certificates have a print page but no
// record page, so there is nowhere to send the user.
const RECORD_HREF: Record<string, (id: string) => string> = {
  'crm.lead': (id) => `/crm/leads/${id}`,
  'crm.opportunity': (id) => `/crm/opportunities/${id}`,
  'crm.account': (id) => `/crm/accounts/${id}`,
  'crm.contact': (id) => `/crm/contacts/${id}`,
  'crm.quotation': (id) => `/crm/quotations/${id}`,
  'tendering.tender': (id) => `/tendering/tenders/${id}`,
  'contracts.contract': (id) => `/contracts/contracts/${id}`,
  'projects.project': (id) => `/projects/projects/${id}`,
};

function hrefFor(n: Notification): string | null {
  if (!n.refType || !n.refId) return null;
  return RECORD_HREF[n.refType]?.(n.refId) ?? null;
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MyDayNotifications({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Record<string, 'busy' | 'read' | 'failed'>>({});
  const [, startRefresh] = useTransition();

  async function markRead(id: string) {
    setDismissed((s) => ({ ...s, [id]: 'busy' }));
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (!res.ok) throw new Error(String(res.status));
      setDismissed((s) => ({ ...s, [id]: 'read' }));
      startRefresh(() => router.refresh());
    } catch {
      setDismissed((s) => ({ ...s, [id]: 'failed' }));
    }
  }

  const visible = notifications.filter((n) => dismissed[n.id] !== 'read');
  if (visible.length === 0) {
    return <p style={st.empty}>Nothing new since you were last here.</p>;
  }

  return (
    <>
      {/* The count lives here, not in the page: dismissing is optimistic and
          router.refresh() takes a second or two to land, so a server-rendered
          count would read "6 unread" above five visible rows in the meantime. */}
      <h2 style={st.h2}>
        Since you were here{' '}
        <span style={st.h2note}>{visible.length} unread across the platform — dismiss as you read</span>
      </h2>
    <ul style={st.list}>
      {visible.map((n) => {
        const href = hrefFor(n);
        const state = dismissed[n.id];
        return (
          <li key={n.id} className="day-note-row" style={st.row}>
            <span style={st.cat}>{n.category ?? 'system'}</span>
            <span style={st.main}>
              <span style={st.title}>
                {href ? (
                  <Link href={href} style={st.link}>
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </span>
              {n.body && <span style={st.body}>{n.body}</span>}
              {state === 'failed' && <span style={st.failed}>could not mark read — retry</span>}
            </span>
            <span style={st.when}>{ago(n.createdAt)}</span>
            <span style={st.act}>
              <button
                type="button"
                style={st.btn}
                disabled={state === 'busy'}
                aria-label={`Mark read: ${n.title}`}
                onClick={() => markRead(n.id)}
              >
                {state === 'busy' ? '…' : 'Mark read'}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
    </>
  );
}

const st = {
  h2: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  h2note: { color: 'var(--muted)', fontSize: 12, fontWeight: 400 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  row: { padding: '9px 0', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  cat: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  main: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } as CSSProperties,
  title: { minWidth: 0 } as CSSProperties,
  body: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.45 } as CSSProperties,
  failed: { color: 'var(--bad)', fontSize: 11 } as CSSProperties,
  when: { color: 'var(--muted)', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  act: { display: 'flex', justifyContent: 'flex-end' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  btn: {
    background: 'var(--panel-2)',
    color: 'var(--muted)',
    border: '1px solid var(--border-strong)',
    borderRadius: 7,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  empty: { color: 'var(--muted)', margin: 0, fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
