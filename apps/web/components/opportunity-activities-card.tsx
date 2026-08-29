'use client';

import { type CSSProperties, useEffect, useState } from 'react';

// Opportunity Activities card — a CONTEXTUAL pointer on the Sales Pipeline, not a work
// surface. It shows how much deal touchpoint work is outstanding, then hands off to the
// all-activity register's "Opportunity" saved view for the full history. This keeps the
// pipeline about deals while My Work remains the place personal activities are executed
// (no duplicated execution logic, context preserved via the deep link).

interface ActivitySummary { open: number; overdue: number; dueToday: number }

export default function OpportunityActivitiesCard() {
  const [c, setC] = useState<{ pending: number; overdue: number; today: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/crm/activities/summary?relatedType=opportunity', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('summary unavailable'))))
      .then((summary: ActivitySummary) => {
        if (!live) return;
        setC({
          pending: summary.open,
          overdue: summary.overdue,
          today: summary.dueToday,
        });
      })
      .catch(() => { if (live) setC(null); });
    return () => { live = false; };
  }, []);

  return (
    <div style={st.card}>
      <div style={st.head}>
        <span style={st.title}>Opportunity Activities</span>
        <a href="/crm/activities?relatedType=opportunity" style={st.link}>Open activity register →</a>
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
  const color = value && tone === 'bad' ? 'var(--bad)' : value && tone === 'accent' ? 'var(--accent)' : 'var(--text)';
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
