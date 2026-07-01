'use client';

import { type CSSProperties, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SavedView { id: string; label: string; path: string; query: string; createdAt: string }

export default function ViewsClient({ initial }: { initial: SavedView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function del(id: string) {
    setBusy(id);
    try { await fetch(`/api/views/${id}`, { method: 'DELETE' }); router.refresh(); }
    finally { setBusy(null); }
  }

  if (initial.length === 0) return <p style={s.muted}>No saved views yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {initial.map((v) => (
        <div key={v.id} style={s.row}>
          <Link href={`${v.path}${v.query ? '?' + v.query : ''}`} style={s.link}>
            <strong>{v.label}</strong>
          </Link>
          <span style={s.path}>{v.path}{v.query ? `?${v.query}` : ''}</span>
          <div style={{ flex: 1 }} />
          <button type="button" style={s.del} disabled={busy === v.id} onClick={() => del(v.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

const s = {
  row: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14 } as CSSProperties,
  path: { color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  del: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', padding: '3px 8px', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
