'use client';

import { type CSSProperties, useEffect, useState } from 'react';

// Opportunity Activities card — a CONTEXTUAL pointer on the Sales Pipeline, not a work
// surface. It shows how much deal touchpoint work is outstanding, then hands off to the
// Activities Work Center's "Opportunity" saved view to actually work it. This keeps the
// pipeline about deals and the Work Center the single place activities are executed
// (no duplicated execution logic, context preserved via the deep link).

interface Activity { relatedType: string | null; dueDate: string | null; status: string }
const isLive = (s: string): boolean => s === 'open' || s === 'in_progress';

export default function OpportunityActivitiesCard() {
  const [c, setC] = useState<{ pending: number; overdue: number; today: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/crm/activities', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((all: Activity[]) => {
        if (!live) return;
        const today = new Date().toISOString().slice(0, 10);
        const opp = (Array.isArray(all) ? all : []).filter((a) => a.relatedType === 'opportunity' && isLive(a.status));
        setC({
          pending: opp.length,
          overdue: opp.filter((a) => a.dueDate && a.dueDate < today).length,
          today: opp.filter((a) => a.dueDate === today).length,
        });
      })
      .catch(() => { if (live) setC({ pending: 0, overdue: 0, today: 0 }); });
    return () => { live = false; };
  }, []);

  return (
    <div style={st.card}>
      <div style={st.head}>
        <span style={st.title}>Opportunity Activities</span>
        <a href="/crm/activities?relatedType=opportunity" style={st.link}>Open Opportunity Activities →</a>
      </div>
      <div style={st.stats}>
        <Stat label="Pending" value={c?.pending} />
        <Stat label="Overdue" value={c?.overdue} tone="bad" />
        <Stat label="Due today" value={c?.today} tone="accent" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value?: number; tone?: 'bad' | 'accent' }) {
  const color = value && tone === 'bad' ? 'var(--bad)' : value && tone === 'accent' ? 'var(--accent)' : 'var(--fg)';
  return (
    <div style={st.stat}>
      <span style={{ ...st.statVal, color }}>{value ?? '—'}</span>
      <span style={st.statLabel}>{label}</span>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  card: { border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', background: 'var(--panel)', marginBottom: 16 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  title: { fontSize: 13, fontWeight: 700 },
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 600 },
  stats: { display: 'flex', gap: 28 },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statVal: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  statLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
};
