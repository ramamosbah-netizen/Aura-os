import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface InboxItem {
  id: string;
  module: string;
  kind: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  value: number | null;
  createdAt: string | null;
}

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function InboxPage() {
  const items = await getJson<InboxItem[]>('/api/inbox');

  const byModule = new Map<string, InboxItem[]>();
  for (const item of items ?? []) {
    const list = byModule.get(item.module) ?? [];
    list.push(item);
    byModule.set(item.module, list);
  }

  return (
    <div style={st.page}>
      <div style={st.titleRow}>
        <h1 style={st.h1}>Inbox</h1>
        {items && items.length > 0 ? <span style={st.countPill}>{items.length} pending</span> : null}
      </div>
      <p style={st.sub}>
        Everything across the platform waiting on a decision — approvals, certifications and
        payments from every module, in one queue.
      </p>

      {items === null ? (
        <section style={st.panel}>
          <p style={st.muted}>API offline.</p>
        </section>
      ) : items.length === 0 ? (
        <section style={st.panel}>
          <p style={st.muted}>All clear — nothing is waiting on you.</p>
        </section>
      ) : (
        [...byModule.entries()].map(([module, moduleItems]) => (
          <section key={module} style={{ marginBottom: 22 }}>
            <h2 style={st.groupTitle}>
              {module} <span style={st.groupCount}>{moduleItems.length}</span>
            </h2>
            <div style={st.panel}>
              <ul style={st.list}>
                {moduleItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`} style={st.row}>
                    <span style={st.action(item.action)}>{item.action}</span>
                    <div style={st.body}>
                      <a href={item.href} style={st.title}>
                        {item.title}
                      </a>
                      <div style={st.detail}>
                        {item.kind}
                        {item.detail ? ` · ${item.detail}` : ''}
                      </div>
                    </div>
                    {item.value !== null ? <span style={st.value}>{money(item.value)}</span> : null}
                    <span style={st.time}>{timeAgo(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  titleRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 } as CSSProperties,
  h1: { fontSize: 28, margin: 0, letterSpacing: -0.5 } as CSSProperties,
  countPill: {
    fontSize: 12.5,
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#0b0e14',
    borderRadius: 999,
    padding: '3px 10px',
  } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '6px 0 24px', maxWidth: 620, lineHeight: 1.5 } as CSSProperties,
  groupTitle: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  groupCount: {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '1px 8px',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '6px 4px',
  } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 14px', margin: 0 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '11px 14px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  action: (verb: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: verb === 'Pay' ? 'var(--good)' : 'var(--accent)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '3px 9px',
    whiteSpace: 'nowrap',
    minWidth: 62,
    textAlign: 'center',
  }),
  body: { flex: 1, minWidth: 0 } as CSSProperties,
  title: {
    color: 'var(--text)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  detail: { fontSize: 12.5, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  value: { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  time: { fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: 56, textAlign: 'right' } as CSSProperties,
};
