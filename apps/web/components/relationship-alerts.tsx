'use client';

import { type CSSProperties, useEffect, useState } from 'react';

// Relationship Intelligence panel — the ranked "act on this now" feed. Fed by
// GET /api/crm/intelligence/alerts. Read-only; each card deep-links to the record.

interface Alert {
  id: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  entity: string;
  entityId: string;
  name: string;
  reason: string;
  recommendation: string;
  href: string;
  at: string | null;
}
interface Payload { counts: Record<string, number>; alerts: Alert[] }

const KIND_META: Record<string, { icon: string; label: string }> = {
  'no-next-action': { icon: '⌦', label: 'No next step' },
  'stalled-opportunity': { icon: '⏸', label: 'Stalled deal' },
  'no-decision-maker': { icon: '☖', label: 'No decision-maker' },
  'inactive-account': { icon: '💤', label: 'Quiet account' },
  'expiring-quote': { icon: '⏳', label: 'Expiring quote' },
};
const SEV_COLOR: Record<string, string> = { high: 'var(--bad)', medium: 'var(--accent)', low: 'var(--muted)' };

export default function RelationshipAlerts({ limit = 12 }: { limit?: number }) {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let live = true;
    void fetch('/api/crm/intelligence/alerts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setData(d && Array.isArray(d.alerts) ? d : { counts: {}, alerts: [] }); })
      .catch(() => { if (live) setData({ counts: {}, alerts: [] }); });
    return () => { live = false; };
  }, []);

  if (!data || data.alerts.length === 0) return null;

  const shown = data.alerts.slice(0, limit);
  return (
    <section style={st.wrap}>
      <div style={st.head}>
        ⚡ Relationship Intelligence
        <span style={st.sub}>{data.counts.total} signal{data.counts.total === 1 ? '' : 's'} to act on</span>
      </div>
      <div style={st.grid}>
        {shown.map((a) => {
          const m = KIND_META[a.kind] ?? { icon: '•', label: a.kind };
          return (
            <a key={a.id} href={a.href} style={{ ...st.card, borderLeft: `3px solid ${SEV_COLOR[a.severity]}` }}>
              <div style={st.cardTop}>
                <span style={{ ...st.kind, color: SEV_COLOR[a.severity] }}>{m.icon} {m.label}</span>
                <span style={st.entity}>{a.entity}</span>
              </div>
              <div style={st.name}>{a.name}</div>
              <div style={st.reason}>{a.reason}</div>
              <div style={st.rec}>→ {a.recommendation}</div>
            </a>
          );
        })}
      </div>
      {data.alerts.length > limit && <div style={st.more}>+{data.alerts.length - limit} more signals</div>}
    </section>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, background: 'var(--panel)' },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--accent)', marginBottom: 10 },
  sub: { fontSize: 11, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 },
  card: { display: 'block', textDecoration: 'none', color: 'inherit', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--panel-2, var(--panel))' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 3 },
  kind: { fontSize: 11, fontWeight: 700 },
  entity: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  name: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  reason: { fontSize: 11.5, color: 'var(--muted)', marginTop: 1 },
  rec: { fontSize: 11, color: 'var(--fg)', marginTop: 4, opacity: 0.85 },
  more: { fontSize: 11, color: 'var(--muted)', marginTop: 8 },
};
