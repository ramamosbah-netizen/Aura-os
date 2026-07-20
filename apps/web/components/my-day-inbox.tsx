'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import Link from 'next/link';
import { SkeletonTable } from './ui/skeleton';

// "Waiting on you", loaded AFTER first paint instead of blocking it.
//
// /api/inbox fans out to 13 module list calls and measured 3.5s — the slowest query
// on the page by 4x, and after the my-day pushdown it WAS the page's floor. Every
// other card had its data and was waiting on this one.
//
// So it no longer runs in the server page's Promise.all. The page renders at the
// speed of its remaining queries and this card fills in behind a skeleton.
//
// It also owns the clear-desk notice, because that claim depends on the pending
// count: "nothing is late, due, or drifting" must not render above a full inbox, and
// only this component knows whether the inbox is full.

export interface InboxItem {
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

const money = (n: number): string => `AED ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

export default function MyDayInbox({ dayIsQuiet }: { dayIsQuiet: boolean }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/inbox', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: InboxItem[]) => {
        if (live) setItems(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    // Say so rather than rendering an empty card that reads as "nothing to approve".
    return (
      <section style={st.card}>
        <h2 style={st.h2}>Waiting on you</h2>
        <p style={st.empty}>
          Could not load the decision queue.{' '}
          <Link href="/workspace" style={st.link}>
            Open the inbox directly →
          </Link>
        </p>
      </section>
    );
  }

  if (items === null) {
    return (
      <section style={st.card} aria-busy="true">
        <h2 style={st.h2}>
          Waiting on you <span style={st.h2note}>loading the decision queue…</span>
        </h2>
        <SkeletonTable rows={4} />
      </section>
    );
  }

  if (items.length === 0) {
    return dayIsQuiet ? (
      <section style={st.card}>
        <p style={st.empty}>
          Nothing is late, due, or drifting on your desk today, and nothing is waiting on your
          decision. An empty day here means an empty desk — not an empty pipeline.
        </p>
      </section>
    ) : null;
  }

  const byModule = Object.entries(
    items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.module]: (acc[i.module] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const top = [...items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5);
  const exposure = items.reduce((sum, i) => sum + (i.value ?? 0), 0);

  return (
    <section style={st.card}>
      <h2 style={st.h2}>
        Waiting on you{' '}
        <span style={st.h2note}>
          {items.length} decision{items.length === 1 ? '' : 's'} across the platform ·{' '}
          {money(exposure)} held up
        </span>
      </h2>
      <div style={st.modChips}>
        {byModule.map(([mod, n]) => (
          <span key={mod} style={st.modChip}>
            {mod} <b style={{ color: 'var(--accent)' }}>{n}</b>
          </span>
        ))}
      </div>
      <ul style={st.list}>
        {top.map((i) => (
          <li key={`${i.module}-${i.id}`} className="day-pend-row" style={st.pendRow}>
            <span style={st.type}>{i.action}</span>
            <span style={st.subject}>
              <Link href={i.href} style={st.link}>
                {i.title}
              </Link>
              <span style={st.dim}> · {i.kind}</span>
            </span>
            <span style={st.due}>{i.value ? money(i.value) : '—'}</span>
          </li>
        ))}
      </ul>
      <p style={st.foot}>
        <Link href="/workspace" style={st.link}>
          All {items.length} in the inbox →
        </Link>
      </p>
    </section>
  );
}

const st = {
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 } as CSSProperties,
  h2: { fontSize: 15, margin: '0 0 10px', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  h2note: { color: 'var(--muted)', fontSize: 12, fontWeight: 400 } as CSSProperties,
  modChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 } as CSSProperties,
  modChip: { border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px', fontSize: 11, color: 'var(--muted)' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0 } as CSSProperties,
  pendRow: { padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 } as CSSProperties,
  type: { color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  subject: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } as CSSProperties,
  due: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none' } as CSSProperties,
  dim: { color: 'var(--muted)' } as CSSProperties,
  foot: { fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' } as CSSProperties,
  empty: { color: 'var(--muted)', margin: 0, fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
