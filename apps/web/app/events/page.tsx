import type { CSSProperties } from 'react';
import type { DomainEvent } from '@aura/shared';
import { getJson } from '../../lib/api';

export const dynamic = 'force-dynamic';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default async function EventsPage() {
  const events = await getJson<DomainEvent[]>('/api/events');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Event stream</h1>
      <p style={st.sub}>
        The append-only spine — every state change across the platform flows through here via the
        transactional outbox.
      </p>
      <section style={st.panel}>
        {events === null ? (
          <p style={st.muted}>API offline.</p>
        ) : events.length === 0 ? (
          <p style={st.muted}>No events yet.</p>
        ) : (
          <ul style={st.list}>
            {events.map((e) => (
              <li key={e.id} style={st.row}>
                <code style={st.type}>{e.type}</code>
                <span style={st.target}>
                  {e.aggregateType}:{e.aggregateId}
                </span>
                <span style={st.time}>{fmt(e.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 24px', maxWidth: 620, lineHeight: 1.5 } as CSSProperties,
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
    alignItems: 'baseline',
    gap: 12,
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  } as CSSProperties,
  type: { fontSize: 13, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  target: { fontSize: 13, color: 'var(--muted)' } as CSSProperties,
  time: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
};
