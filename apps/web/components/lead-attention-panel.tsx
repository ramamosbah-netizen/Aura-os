'use client';

import { useMemo, useState, type CSSProperties } from 'react';

// Lead OS "Needs Attention" cockpit — surfaces which leads need work now, with the
// EXACT reasons (not just a red badge). Views: All / Mine / Needs Attention / Nurture.
// Fed by /api/crm/leads/command; attention is computed server-side by shared leadAttention().

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type Gap =
  | 'UNASSIGNED' | 'SLA_BREACHED' | 'NO_NEXT_ACTIVITY'
  | 'FOLLOW_UP_OVERDUE' | 'STALE' | 'QUALIFICATION_STALLED';

interface Row {
  id: string;
  name: string;
  companyName: string | null;
  status: string;
  source: string | null;
  assignedTo: string | null;
  assignedToMe: boolean;
  ageDays: number;
  lastActivityIso: string | null;
  nextActivityDueIso: string | null;
  attention: { active: boolean; needsAttention: boolean; severity: Severity | null; gaps: Gap[] };
}
interface Counts { all: number; mine: number; needsAttention: number; nurture: number }
export interface LeadCommand { generatedAt: string; counts: Counts; leads: Row[] }

type View = 'all' | 'mine' | 'attention' | 'nurture';
const NURTURE = new Set(['nurturing', 'disqualified']);

const GAP_LABEL: Record<Gap, string> = {
  UNASSIGNED: 'Unassigned',
  SLA_BREACHED: 'SLA breached',
  NO_NEXT_ACTIVITY: 'No next activity',
  FOLLOW_UP_OVERDUE: 'Follow-up overdue',
  STALE: 'Stale',
  QUALIFICATION_STALLED: 'Qualification stalled',
};
const SEV_COLOR: Record<Severity, string> = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: 'var(--muted)' };

export default function LeadAttentionPanel({ data }: { data: LeadCommand | null }) {
  const [view, setView] = useState<View>('attention');
  const rows = data?.leads ?? [];
  const counts = data?.counts ?? { all: 0, mine: 0, needsAttention: 0, nurture: 0 };

  const shown = useMemo(() => {
    switch (view) {
      case 'mine': return rows.filter((r) => r.assignedToMe);
      case 'attention': return rows.filter((r) => r.attention.needsAttention);
      case 'nurture': return rows.filter((r) => NURTURE.has(r.status));
      default: return rows;
    }
  }, [rows, view]);

  const tabs: Array<{ key: View; label: string; n: number }> = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'mine', label: 'Mine', n: counts.mine },
    { key: 'attention', label: 'Needs Attention', n: counts.needsAttention },
    { key: 'nurture', label: 'Nurture', n: counts.nurture },
  ];

  return (
    <section style={st.panel}>
      <div style={st.head}>
        <h2 style={st.h2}>Lead Command</h2>
        <div style={st.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{ ...st.tab, ...(view === t.key ? st.tabOn : {}) }}
            >
              {t.label} <span style={st.count}>{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <p style={st.empty}>Lead command unavailable.</p>
      ) : shown.length === 0 ? (
        <p style={st.empty}>Nothing here — all clear.</p>
      ) : (
        <ul style={st.list}>
          {shown.map((r) => (
            <li key={r.id} style={st.row}>
              <span style={{ ...st.dot, background: r.attention.severity ? SEV_COLOR[r.attention.severity] : 'var(--border)' }} />
              <div style={st.main}>
                <div style={st.title}>
                  {r.name}
                  {r.companyName ? <span style={st.company}> · {r.companyName}</span> : null}
                </div>
                <div style={st.meta}>
                  <span style={st.status}>{r.status}</span>
                  <span>· {r.ageDays}d old</span>
                  <span>· {r.assignedTo ? (r.assignedToMe ? 'mine' : 'assigned') : 'unassigned'}</span>
                </div>
                {r.attention.gaps.length > 0 && (
                  <div style={st.chips}>
                    {r.attention.gaps.map((g) => (
                      <span key={g} style={st.chip}>{GAP_LABEL[g]}</span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const st = {
  panel: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)', padding: 16, marginBottom: 22 } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 } as CSSProperties,
  h2: { fontSize: 16, margin: 0, letterSpacing: -0.3 } as CSSProperties,
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  tab: { fontSize: 12.5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' } as CSSProperties,
  tabOn: { background: 'var(--panel-2)', color: 'var(--fg)', borderColor: 'var(--fg)' } as CSSProperties,
  count: { opacity: 0.7, marginLeft: 2 } as CSSProperties,
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px', borderTop: '1px solid var(--border)' } as CSSProperties,
  dot: { width: 8, height: 8, borderRadius: 999, marginTop: 6, flexShrink: 0 } as CSSProperties,
  main: { minWidth: 0 } as CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } as CSSProperties,
  company: { color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  meta: { fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 } as CSSProperties,
  status: { textTransform: 'capitalize' } as CSSProperties,
  chips: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 } as CSSProperties,
  chip: { fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--fg)' } as CSSProperties,
  empty: { color: 'var(--muted)', fontSize: 13, margin: '8px 4px' } as CSSProperties,
};
