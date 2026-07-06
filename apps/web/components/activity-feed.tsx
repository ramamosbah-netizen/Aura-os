'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import type { DomainEvent } from '@aura/shared';
import { areaLabel, humanizeEventType } from '@/lib/event-labels';

function moduleOf(type: string): string {
  return type.split('.')[0] ?? '';
}

// Small glyph map per module — falls back to a dot. Purely decorative.
const GLYPH: Record<string, string> = {
  crm: '◎', tendering: '◳', contracts: '▦', projects: '▥', subcontracts: '▧',
  procurement: '▣', inventory: '▦', finance: '◰', hr: '👤', hse: '🛡',
  quality: '✓', fleet: '🚚', assets: '🔧', amc: '♺', engineering: '⚙',
  site: '▤', doccontrol: '▤', documents: '▤', intelligence: '✶', workflow: '⚡',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PERIODS: { key: string; label: string; ms: number | null }[] = [
  { key: 'all', label: 'All time', ms: null },
  { key: '24h', label: '24 hours', ms: 24 * 3600_000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 3600_000 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 3600_000 },
];

/**
 * Activity feed with module + period filters. Renders human-readable event labels
 * (via the shared product-language layer) instead of raw event types.
 */
export default function ActivityFeed({ events }: { events: DomainEvent[] }) {
  const [module, setModule] = useState<string>('all');
  const [period, setPeriod] = useState<string>('all');

  const modules = useMemo(() => {
    const set = new Map<string, number>();
    for (const e of events) {
      const m = moduleOf(e.type);
      set.set(m, (set.get(m) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const filtered = useMemo(() => {
    const cutoff = PERIODS.find((p) => p.key === period)?.ms ?? null;
    const minTime = cutoff ? Date.now() - cutoff : 0;
    return events
      .filter((e) => (module === 'all' ? true : moduleOf(e.type) === module))
      .filter((e) => (cutoff ? new Date(e.occurredAt).getTime() >= minTime : true))
      .slice(0, 40);
  }, [events, module, period]);

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <h2 style={s.title}>Activity feed</h2>
        <select style={s.period} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      <div style={s.chips}>
        <button
          type="button"
          style={module === 'all' ? { ...s.chip, ...s.chipActive } : s.chip}
          onClick={() => setModule('all')}
        >
          All
        </button>
        {modules.map(([m, n]) => (
          <button
            key={m}
            type="button"
            style={module === m ? { ...s.chip, ...s.chipActive } : s.chip}
            onClick={() => setModule(m)}
          >
            {areaLabel(m)} <span style={s.chipCount}>{n}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={s.empty}>No activity in this view.</p>
      ) : (
        <ul style={s.list}>
          {filtered.map((e) => (
            <li key={e.id} style={s.row}>
              <span style={s.glyph}>{GLYPH[moduleOf(e.type)] ?? '•'}</span>
              <span style={s.label}>{humanizeEventType(e.type).label}</span>
              <span style={s.mod}>{areaLabel(moduleOf(e.type))}</span>
              <span style={s.time}>{timeAgo(e.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s = {
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
    marginTop: 16,
  } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 } as CSSProperties,
  title: { fontSize: 15, margin: 0, color: 'var(--text)' } as CSSProperties,
  period: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12.5,
    padding: '5px 8px',
    outline: 'none',
    cursor: 'pointer',
  } as CSSProperties,
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 } as CSSProperties,
  chip: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    color: 'var(--muted)',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
  } as CSSProperties,
  chipActive: { background: 'var(--accent)', color: '#0b0e14', border: '1px solid var(--accent)', fontWeight: 600 } as CSSProperties,
  chipCount: { opacity: 0.7, fontSize: 11 } as CSSProperties,
  empty: { color: 'var(--muted)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 340, overflowY: 'auto' } as CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  glyph: { width: 18, textAlign: 'center', color: 'var(--accent)', flexShrink: 0 } as CSSProperties,
  label: { fontSize: 13, color: 'var(--text)' } as CSSProperties,
  mod: { fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 } as CSSProperties,
  time: { fontSize: 11.5, color: 'var(--muted)', width: 64, textAlign: 'right', flexShrink: 0 } as CSSProperties,
};
