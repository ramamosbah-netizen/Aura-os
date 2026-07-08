'use client';

import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface Series {
  labels: Record<string, string>;
  value: number;
}
interface Metric {
  name: string;
  type: 'counter' | 'gauge';
  help: string;
  series: Series[];
}
export interface OpsSnapshot {
  metrics: Metric[];
  dbConnected: boolean;
  generatedAt: string;
}

const gaugeValue = (metrics: Metric[], name: string): number =>
  metrics.find((m) => m.name === name)?.series[0]?.value ?? 0;

export default function OpsDashboardClient({ initial }: { initial: OpsSnapshot }) {
  const [snap, setSnap] = useState<OpsSnapshot>(initial);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/ops', { cache: 'no-store' });
      if (res.ok) setSnap(await res.json());
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh every 15s.
  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, []);

  const pending = gaugeValue(snap.metrics, 'outbox_pending');
  const deadLetter = gaugeValue(snap.metrics, 'outbox_dead_letter');
  const counters = snap.metrics.filter((m) => m.type === 'counter' && m.series.some((s) => s.value > 0));

  return (
    <div>
      <div style={st.bar}>
        <span style={{ color: snap.dbConnected ? '#22c55e' : 'var(--muted)', fontSize: 13 }}>
          {snap.dbConnected ? '● database connected' : '○ no database (dev)'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={st.stamp}>updated {new Date(snap.generatedAt).toLocaleTimeString()}</span>
        <button style={st.btnGhost} disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div style={st.cards}>
        <Stat label="Outbox pending" value={pending} tone={pending > 100 ? 'warn' : 'ok'} hint="unprocessed events (delivery lag)" />
        <Stat label="Dead-lettered" value={deadLetter} tone={deadLetter > 0 ? 'bad' : 'ok'} hint="stuck after max attempts" />
      </div>

      {counters.length > 0 && (
        <section style={st.card}>
          <h2 style={st.h2}>Counters</h2>
          {counters.map((m) => (
            <div key={m.name} style={{ marginBottom: 12 }}>
              <div style={st.metricName}>{m.name} <span style={st.help}>{m.help}</span></div>
              <table style={st.table}>
                <tbody>
                  {m.series.map((s, i) => (
                    <tr key={i}>
                      <td style={st.tdMono}>{Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '(total)'}</td>
                      <td style={{ ...st.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad'; hint: string }) {
  const color = tone === 'bad' ? '#ef4444' : tone === 'warn' ? '#f59e0b' : '#22c55e';
  return (
    <div style={st.stat}>
      <div style={st.statLabel}>{label}</div>
      <div style={{ ...st.statValue, color }}>{value}</div>
      <div style={st.statHint}>{hint}</div>
    </div>
  );
}

const st = {
  bar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 } as CSSProperties,
  stamp: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  cards: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 } as CSSProperties,
  stat: { flex: 1, minWidth: 180, border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', background: 'var(--panel)' } as CSSProperties,
  statLabel: { color: 'var(--muted)', fontSize: 12.5, marginBottom: 6 } as CSSProperties,
  statValue: { fontSize: 30, fontWeight: 600, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  statHint: { color: 'var(--muted)', fontSize: 11.5, marginTop: 4 } as CSSProperties,
  card: { border: '1px solid var(--border)', borderRadius: 10, padding: '18px', background: 'var(--panel)' } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 12px' } as CSSProperties,
  metricName: { fontFamily: 'ui-monospace, monospace', fontSize: 12.5, marginBottom: 4 } as CSSProperties,
  help: { color: 'var(--muted)', fontFamily: 'system-ui', fontSize: 12, marginLeft: 8 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  td: { padding: '5px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMono: { padding: '5px 8px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12 } as CSSProperties,
  btnGhost: { padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
};
