'use client';

import { type CSSProperties, useEffect, useState } from 'react';

// Unified Timeline — one chronological feed for a CRM record, merging domain
// events (stage changes, quotes, contracts…) with logged activities. Fed by
// GET /api/crm/timeline?id=<recordId>.

interface TimelineEntry {
  id: string;
  at: string;
  kind: 'event' | 'activity';
  icon: string;
  title: string;
  detail: string | null;
  tone: 'good' | 'bad' | 'accent' | 'muted';
}

const TONE: Record<string, string> = { good: 'var(--good)', bad: 'var(--bad)', accent: 'var(--accent)', muted: 'var(--muted)' };
const fmt = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function Timeline({ recordId, limit = 50 }: { recordId: string; limit?: number }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/crm/timeline?id=${encodeURIComponent(recordId)}&limit=${limit}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (live) setEntries(Array.isArray(d) ? d : []); })
      .catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, [recordId, limit]);

  if (entries === null) return <p style={st.muted}>Loading timeline…</p>;
  if (entries.length === 0) return <p style={st.muted}>Nothing on the timeline yet — events and activities will appear here.</p>;

  return (
    <ol style={st.list}>
      {entries.map((e) => (
        <li key={`${e.kind}-${e.id}`} style={st.row}>
          <span style={{ ...st.icon, color: TONE[e.tone] }} aria-hidden>{e.icon}</span>
          <div style={st.body}>
            <div style={st.title}>
              {e.title}
              <span style={st.kindTag}>{e.kind}</span>
            </div>
            {e.detail && <div style={st.detail}>{e.detail}</div>}
          </div>
          <time style={st.time} dateTime={e.at}>{fmt(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}

const st: Record<string, CSSProperties> = {
  muted: { color: 'var(--muted)', fontSize: 12.5, margin: '6px 2px' },
  list: { listStyle: 'none', margin: 0, padding: 0, borderLeft: '1px solid var(--border)', marginLeft: 8 },
  row: { display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '8px 0 8px 4px', position: 'relative' },
  icon: { fontSize: 14, lineHeight: '18px', textAlign: 'center', marginLeft: -12, background: 'var(--bg, var(--panel))', width: 22 },
  body: { minWidth: 0 },
  title: { fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kindTag: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 6px' },
  detail: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  time: { fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' },
};
