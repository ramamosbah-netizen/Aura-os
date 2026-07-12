'use client';

import { type CSSProperties, useMemo, useState } from 'react';

// Relationship Intelligence — the CRM alert engine. A single ranked list of
// "act on this now" signals across accounts, opportunities and quotes, filterable
// by kind and severity. Read-only; every row links to the record to act on.

export interface Alert {
  id: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  entity: 'account' | 'opportunity' | 'quotation';
  entityId: string;
  name: string;
  reason: string;
  recommendation: string;
  href: string;
  at: string | null;
}
export interface AlertsPayload {
  counts: Record<string, number>;
  alerts: Alert[];
  thresholds: Record<string, number>;
}

export const KIND_LABEL: Record<string, string> = {
  'no-next-action': 'No next step',
  'stalled-opportunity': 'Stalled deal',
  'inactive-account': 'Quiet account',
  'no-decision-maker': 'No decision-maker',
  'expiring-quote': 'Expiring quote',
};
export const KIND_GLYPH: Record<string, string> = {
  'no-next-action': '⚑', 'stalled-opportunity': '💤', 'inactive-account': '◎', 'no-decision-maker': '☎', 'expiring-quote': '✎',
};
export const SEV = {
  high: { label: 'High', color: 'var(--bad)' },
  medium: { label: 'Medium', color: 'var(--warn, #d97706)' },
  low: { label: 'Low', color: 'var(--muted)' },
} as const;

const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString() : '—');

export default function RelationshipIntelligenceClient({ data }: { data: AlertsPayload | null }) {
  const [kind, setKind] = useState('');
  const [sev, setSev] = useState('');

  const alerts = useMemo(() => {
    let out = data?.alerts ?? [];
    if (kind) out = out.filter((a) => a.kind === kind);
    if (sev) out = out.filter((a) => a.severity === sev);
    return out;
  }, [data, kind, sev]);

  if (data === null) return <p style={st.muted}>API offline.</p>;

  const counts = data.counts ?? {};
  const bySev = { high: 0, medium: 0, low: 0 } as Record<string, number>;
  for (const a of data.alerts) bySev[a.severity] += 1;
  const kinds = Object.keys(KIND_LABEL).filter((k) => (counts[k] ?? 0) > 0);

  return (
    <>
      {/* severity KPIs */}
      <div style={st.cards}>
        <Kpi label="Total signals" value={String(counts.total ?? data.alerts.length)} />
        <Kpi label="High" value={String(bySev.high)} color={bySev.high > 0 ? 'var(--bad)' : undefined} />
        <Kpi label="Medium" value={String(bySev.medium)} color={bySev.medium > 0 ? 'var(--warn, #d97706)' : undefined} />
        <Kpi label="Low" value={String(bySev.low)} />
      </div>

      {/* filters */}
      <div style={st.filters}>
        <button onClick={() => setKind('')} style={{ ...st.chip, ...(kind === '' ? st.chipOn : {}) }}>All kinds</button>
        {kinds.map((k) => (
          <button key={k} onClick={() => setKind(k === kind ? '' : k)} style={{ ...st.chip, ...(kind === k ? st.chipOn : {}) }}>
            {KIND_GLYPH[k]} {KIND_LABEL[k]} <span style={st.chipCount}>{counts[k]}</span>
          </button>
        ))}
        <span style={{ width: 12 }} />
        {(['high', 'medium', 'low'] as const).map((s) => (
          <button key={s} onClick={() => setSev(s === sev ? '' : s)} style={{ ...st.chip, ...(sev === s ? { ...st.chipOn, borderColor: SEV[s].color, color: SEV[s].color } : {}) }}>
            {SEV[s].label}
          </button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <p style={st.muted}>{data.alerts.length === 0 ? 'No open signals — every relationship has a next step and recent activity. 🎯' : 'Nothing matches the filter.'}</p>
      ) : (
        <section className="panel" style={{ padding: 0 }}>
          <table className="data-table">
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ width: 70 }}>
                    <span style={{ ...st.sevDot, background: SEV[a.severity].color }} />
                    <span style={{ fontSize: 11, color: SEV[a.severity].color, fontWeight: 700 }}>{SEV[a.severity].label}</span>
                  </td>
                  <td style={{ width: 150 }}><span style={st.kindTag}>{KIND_GLYPH[a.kind]} {KIND_LABEL[a.kind] ?? a.kind}</span></td>
                  <td>
                    <a href={a.href} style={st.link}>{a.name}</a>
                    <div style={st.reason}>{a.reason}</div>
                  </td>
                  <td style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>{a.recommendation}</td>
                  <td style={{ width: 100, color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt(a.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(color ? { color } : {}) }}>{value}</div>
    </div>
  );
}

const st = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 20, fontWeight: 700, marginTop: 4 } as CSSProperties,
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 } as CSSProperties,
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--fg)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
  chipOn: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 } as CSSProperties,
  chipCount: { fontSize: 11, background: 'var(--panel-2)', borderRadius: 999, padding: '0 6px', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 4px' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  reason: { fontSize: 12, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  kindTag: { fontSize: 11.5, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' } as CSSProperties,
  sevDot: { display: 'inline-block', width: 8, height: 8, borderRadius: 999, marginRight: 6, verticalAlign: 'middle' } as CSSProperties,
};
