'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { KIND_LABEL, KIND_GLYPH, SEV, type Alert, type AlertsPayload } from './relationship-intelligence-client';

// CRM Advisor — an ambient, dismissible side panel that rides along on every CRM
// page. On load it surfaces the ranked "act on this now" signals (the same
// Relationship Intelligence feed) as advice, links each to the record, and can be
// hidden to a small edge tab. It re-opens on a fresh page load; hiding persists
// while you navigate between CRM pages (the layout keeps this component mounted).

export default function CrmAdvisor() {
  const pathname = usePathname();
  const [data, setData] = useState<AlertsPayload | null>(null);
  const [open, setOpen] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch('/api/crm/intelligence/alerts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setData(d); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Activities has its own inline Relationship-Intelligence panel — don't double up there.
  if (pathname?.startsWith('/crm/activities')) return null;
  if (!loaded || !data || data.alerts.length === 0) return null;

  const alerts = data.alerts;
  const high = alerts.filter((a) => a.severity === 'high').length;

  // Collapsed → a floating edge tab that reopens the panel.
  if (!open) {
    return (
      <button style={st.tab} onClick={() => setOpen(true)} title="Show relationship advice">
        <span style={st.tabIcon}>⚡</span>
        <span style={{ ...st.tabCount, ...(high > 0 ? { background: 'var(--bad)' } : {}) }}>{alerts.length}</span>
      </button>
    );
  }

  return (
    <aside style={st.panel} aria-label="Relationship advisor">
      <div style={st.head}>
        <div style={{ minWidth: 0 }}>
          <div style={st.title}>⚡ Advisor</div>
          <div style={st.sub}>{alerts.length} signal{alerts.length === 1 ? '' : 's'} to act on{high > 0 ? ` · ${high} high` : ''}</div>
        </div>
        <button style={st.hide} onClick={() => setOpen(false)} title="Hide (reopens on reload)">✕</button>
      </div>

      <div style={st.list}>
        {alerts.slice(0, 20).map((a) => (
          <AdviceCard key={a.id} a={a} />
        ))}
      </div>

      <a href="/crm/activities" style={st.footer}>See all in Activities →</a>
    </aside>
  );
}

function AdviceCard({ a }: { a: Alert }) {
  const color = SEV[a.severity].color;
  return (
    <a href={a.href} style={{ ...st.card, borderLeft: `3px solid ${color}` }}>
      <div style={st.cardTop}>
        <span style={st.kind}>{KIND_GLYPH[a.kind]} {KIND_LABEL[a.kind] ?? a.kind}</span>
        <span style={{ ...st.sev, color }}>{SEV[a.severity].label}</span>
      </div>
      <div style={st.name}>{a.name}</div>
      <div style={st.reason}>{a.reason}</div>
      <div style={st.rec}>→ {a.recommendation}</div>
    </a>
  );
}

const st = {
  panel: {
    // Anchored top-right with a bounded height so it never covers the AURA Copilot
    // launcher in the bottom-right corner.
    position: 'fixed', top: 64, right: 12, width: 320, maxHeight: 'calc(100vh - 150px)', zIndex: 40,
    display: 'flex', flexDirection: 'column',
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.28)', overflow: 'hidden',
  } as CSSProperties,
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  title: { fontSize: 14, fontWeight: 800, color: 'var(--accent)' } as CSSProperties,
  sub: { fontSize: 11.5, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  hide: { border: '1px solid var(--border)', background: 'var(--panel-2, transparent)', color: 'var(--muted)', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', fontSize: 12, lineHeight: 1, flexShrink: 0 } as CSSProperties,
  list: { overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } as CSSProperties,
  card: { display: 'block', textDecoration: 'none', background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' } as CSSProperties,
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 } as CSSProperties,
  kind: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' } as CSSProperties,
  sev: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  name: { fontSize: 13, fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  reason: { fontSize: 11.5, color: 'var(--muted)', marginTop: 1 } as CSSProperties,
  rec: { fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 5 } as CSSProperties,
  footer: { display: 'block', textAlign: 'center', padding: '10px 12px', borderTop: '1px solid var(--border)', color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 } as CSSProperties,
  tab: {
    position: 'fixed', top: 90, right: 0, zIndex: 40,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    background: 'var(--panel)', border: '1px solid var(--border)', borderRight: 'none',
    borderRadius: '10px 0 0 10px', padding: '10px 8px', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
  } as CSSProperties,
  tabIcon: { fontSize: 16 } as CSSProperties,
  tabCount: { fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '0 6px', minWidth: 18, textAlign: 'center' } as CSSProperties,
};
