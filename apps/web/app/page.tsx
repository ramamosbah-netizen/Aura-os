import type { CSSProperties } from 'react';
import type { DomainEvent, Document } from '@aura/shared';
import { apiBase, getJson } from '../lib/api';

// The Workspace is live — always render per request against the API.
export const dynamic = 'force-dynamic';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function WorkspacePage() {
  const [events, documents] = await Promise.all([
    getJson<DomainEvent[]>('/api/events'),
    getJson<Document[]>('/api/documents'),
  ]);
  const online = events !== null || documents !== null;

  // Group the recent event stream by module/area (the part before the first dot).
  const byArea = new Map<string, number>();
  for (const e of events ?? []) {
    const area = e.type.split('.')[0];
    byArea.set(area, (byArea.get(area) ?? 0) + 1);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1] - a[1]);
  const maxArea = areas.length ? areas[0][1] : 1;
  const recent = [...(events ?? [])].slice(0, 12);

  return (
    <div style={s.shell}>
      <div style={s.titleRow}>
        <h1 style={s.h1}>My Workspace</h1>
        <div style={s.pill(online)}>
          <span style={s.dot(online)} /> {online ? 'API online' : 'API offline'}
        </div>
      </div>
      <p style={s.sub}>
        Your live view across the platform — fed by the event spine. Everything below is real data
        from the kernel.
      </p>

      {!online ? (
        <section style={s.panel}>
          <h2 style={s.panelTitle}>API offline</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Start the API to populate the Workspace:
            <br />
            <code style={s.code}>pnpm --filter @aura/api start</code> (expected at{' '}
            <code style={s.code}>{apiBase()}</code>)
          </p>
        </section>
      ) : (
        <>
          <section style={s.cards}>
            <Stat label="Recent events" value={events?.length ?? 0} hint="on the spine" />
            <Stat label="Documents" value={documents?.length ?? 0} hint="in the DMS" />
            <Stat label="Active areas" value={areas.length} hint="modules emitting" />
          </section>

          <section style={s.grid}>
            <div style={s.panel}>
              <h2 style={s.panelTitle}>Activity by area</h2>
              {areas.length === 0 ? (
                <Empty text="No events yet — emit one via the API to see it here." />
              ) : (
                <ul style={s.list}>
                  {areas.map(([area, n]) => (
                    <li key={area} style={s.areaRow}>
                      <span style={s.areaName}>{area}</span>
                      <span style={s.barTrack}>
                        <span style={{ ...s.barFill, width: `${(n / maxArea) * 100}%` }} />
                      </span>
                      <span style={s.areaCount}>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={s.panel}>
              <h2 style={s.panelTitle}>Recent activity</h2>
              {recent.length === 0 ? (
                <Empty text="Nothing yet." />
              ) : (
                <ul style={s.list}>
                  {recent.map((e) => (
                    <li key={e.id} style={s.eventRow}>
                      <code style={s.eventType}>{e.type}</code>
                      <span style={s.eventTarget}>
                        {e.aggregateType}:{e.aggregateId}
                      </span>
                      <span style={s.eventTime}>{timeAgo(e.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      <footer style={s.footer}>AURA OS · Phase 0c — the experience shell (Workspace v1)</footer>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div style={s.card}>
      <div style={s.cardValue}>{value}</div>
      <div style={s.cardLabel}>{label}</div>
      <div style={s.cardHint}>{hint}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: 'var(--muted)', margin: '6px 0 0' }}>{text}</p>;
}

const s = {
  shell: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 6,
  } as CSSProperties,
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 36,
  } as CSSProperties,
  brand: { fontWeight: 700, fontSize: 18, letterSpacing: 0.5 } as CSSProperties,
  diamond: { color: 'var(--accent)', marginRight: 6 } as CSSProperties,
  pill: (ok: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: ok ? 'var(--good)' : 'var(--bad)',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '6px 12px',
  }),
  dot: (ok: boolean): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ok ? 'var(--good)' : 'var(--bad)',
  }),
  h1: { fontSize: 34, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 28px', maxWidth: 620, lineHeight: 1.5 } as CSSProperties,
  cards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 } as CSSProperties,
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  cardValue: { fontSize: 30, fontWeight: 700 } as CSSProperties,
  cardLabel: { marginTop: 4, fontSize: 14 } as CSSProperties,
  cardHint: { marginTop: 2, fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  } as CSSProperties,
  panelTitle: { fontSize: 15, margin: '0 0 12px', color: 'var(--text)' } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  areaRow: { display: 'grid', gridTemplateColumns: '110px 1fr 28px', alignItems: 'center', gap: 10 } as CSSProperties,
  areaName: { fontSize: 13, color: 'var(--text)' } as CSSProperties,
  barTrack: { height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { display: 'block', height: '100%', background: 'var(--accent)', borderRadius: 999 } as CSSProperties,
  areaCount: { fontSize: 13, color: 'var(--muted)', textAlign: 'right' } as CSSProperties,
  eventRow: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } as CSSProperties,
  eventType: { fontSize: 12.5, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' } as CSSProperties,
  eventTarget: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  eventTime: { fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 6px',
  } as CSSProperties,
  footer: { marginTop: 40, color: 'var(--muted)', fontSize: 12, textAlign: 'center' } as CSSProperties,
};
