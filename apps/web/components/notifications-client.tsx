'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Notification { id: string; title: string; body: string; category: string; read: boolean; createdAt: string }

function fmt(iso: string) { return new Date(iso).toLocaleString(); }

export default function NotificationsClient({ initial }: { initial: Notification[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markRead(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      router.refresh();
    } finally { setBusy(false); }
  }

  if (initial.length === 0) return <p style={s.muted}>No notifications.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {initial.map((n) => (
        <div key={n.id} style={{ ...s.card, ...(n.read ? s.read : s.unread) }}>
          <div style={{ flex: 1 }}>
            <div style={s.titleRow}>
              <span style={s.cat}>{n.category}</span>
              <strong>{n.title}</strong>
              {!n.read && <span style={s.dot} />}
            </div>
            <div style={s.body}>{n.body}</div>
            <div style={s.time}>{fmt(n.createdAt)}</div>
          </div>
          {!n.read && (
            <button type="button" style={s.btn} onClick={() => markRead(n.id)} disabled={busy}>Mark read</button>
          )}
        </div>
      ))}
    </div>
  );
}

const s = {
  card: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' } as CSSProperties,
  unread: { borderColor: 'var(--accent)' } as CSSProperties,
  read: { opacity: 0.6 } as CSSProperties,
  titleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 } as CSSProperties,
  cat: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px' } as CSSProperties,
  dot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' } as CSSProperties,
  body: { color: 'var(--muted)', fontSize: 13, marginTop: 3 } as CSSProperties,
  time: { color: 'var(--muted)', fontSize: 11, marginTop: 4 } as CSSProperties,
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
