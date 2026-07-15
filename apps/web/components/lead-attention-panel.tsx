'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

// Lead OS cockpit — surfaces which leads need work now, with the EXACT reasons (not just
// a red badge). Views: All / Mine / Needs Attention / Nurture / Converted / Disqualified,
// plus Sources — the per-channel funnel (arrived → converted/died, and how fast).
// Fed by /api/crm/leads/command; attention + source performance are computed server-side.

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
  /** G3 — derived server-side from the stored dimensions. `attention` = is anyone working it;
   * this = is it worth working. Two independent questions, both needed to triage a lead. */
  qualification: {
    score: number;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    coverage: { rated: number; total: number };
    recommendation: 'QUALIFY' | 'NURTURE' | 'DISQUALIFY' | 'REVIEW';
    gaps: Array<{ key: string; label: string; value: number | null }>;
  };
}
interface Counts { all: number; mine: number; needsAttention: number; nurture: number; converted: number; disqualified: number }
/** G7 — one source's funnel, derived server-side from the leads themselves. */
interface SourcePerformance {
  source: string;
  total: number;
  active: number;
  converted: number;
  disqualified: number;
  nurturing: number;
  needsAttention: number;
  conversionRate: number;
  avgAgeDays: number;
}
export interface LeadCommand { generatedAt: string; counts: Counts; sources: SourcePerformance[]; leads: Row[] }

type View = 'all' | 'mine' | 'attention' | 'nurture' | 'converted' | 'disqualified' | 'sources';

const GAP_LABEL: Record<Gap, string> = {
  UNASSIGNED: 'Unassigned',
  SLA_BREACHED: 'SLA breached',
  NO_NEXT_ACTIVITY: 'No next activity',
  FOLLOW_UP_OVERDUE: 'Follow-up overdue',
  STALE: 'Stale',
  QUALIFICATION_STALLED: 'Qualification stalled',
};
const SEV_COLOR: Record<Severity, string> = { HIGH: '#dc2626', MEDIUM: '#d97706', LOW: 'var(--muted)' };

/** G3 verdicts. REVIEW is not a failure — it means "go and find out", which is real work. */
const REC_LABEL: Record<string, string> = {
  QUALIFY: 'qualify',
  NURTURE: 'nurture',
  DISQUALIFY: 'disqualify',
  REVIEW: 'needs review',
};
const REC_STYLE: Record<string, CSSProperties> = {
  QUALIFY: { color: 'var(--good)' },
  DISQUALIFY: { color: 'var(--bad)' },
  NURTURE: { color: 'var(--muted)' },
  REVIEW: { color: 'var(--accent)' },
};

type ConvertState = { phase: 'preview' | 'busy' | 'error'; dupConfidence?: string; message?: string };

export default function LeadAttentionPanel({ data }: { data: LeadCommand | null }) {
  const router = useRouter();
  const [view, setView] = useState<View>('attention');
  const [convert, setConvert] = useState<Record<string, ConvertState>>({});
  const rows = data?.leads ?? [];
  const counts = data?.counts ?? { all: 0, mine: 0, needsAttention: 0, nurture: 0, converted: 0, disqualified: 0 };
  const sources = data?.sources ?? [];

  const setC = (id: string, s: ConvertState | null): void =>
    setConvert((prev) => {
      const next = { ...prev };
      if (s === null) delete next[id]; else next[id] = s;
      return next;
    });

  // Step 1: dry-run to reveal a possible duplicate account before committing.
  const startConvert = async (id: string): Promise<void> => {
    setC(id, { phase: 'busy' });
    try {
      const res = await fetch(`/api/crm/leads/${id}/convert-preview`, { cache: 'no-store' });
      const preview = await res.json();
      const best: string = preview?.account?.best ?? 'NONE';
      setC(id, { phase: 'preview', dupConfidence: best });
    } catch {
      setC(id, { phase: 'error', message: 'Preview failed' });
    }
  };

  // Step 2: commit — link to the match (default) or force a new account.
  const doConvert = async (id: string, createNewAccount: boolean): Promise<void> => {
    setC(id, { phase: 'busy' });
    try {
      const res = await fetch(`/api/crm/leads/${id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ createNewAccount }),
      });
      if (!res.ok) throw new Error();
      setC(id, null);
      router.refresh(); // converted lead drops out of the active views
    } catch {
      setC(id, { phase: 'error', message: 'Convert failed' });
    }
  };

  // G7 — Converted and Disqualified are views of their own; Nurture is parked-but-alive only.
  const shown = useMemo(() => {
    switch (view) {
      case 'mine': return rows.filter((r) => r.assignedToMe);
      case 'attention': return rows.filter((r) => r.attention.needsAttention);
      case 'nurture': return rows.filter((r) => r.status === 'nurturing');
      case 'converted': return rows.filter((r) => r.status === 'converted');
      case 'disqualified': return rows.filter((r) => r.status === 'disqualified');
      case 'sources': return [];
      default: return rows;
    }
  }, [rows, view]);

  const tabs: Array<{ key: View; label: string; n: number }> = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'mine', label: 'Mine', n: counts.mine },
    { key: 'attention', label: 'Needs Attention', n: counts.needsAttention },
    { key: 'nurture', label: 'Nurture', n: counts.nurture },
    { key: 'converted', label: 'Converted', n: counts.converted },
    { key: 'disqualified', label: 'Disqualified', n: counts.disqualified },
    { key: 'sources', label: 'Sources', n: sources.length },
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
      ) : view === 'sources' ? (
        <SourcesTable sources={sources} />
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
                  {/* Score and confidence always travel together: 90/100 from one rated dimension
                      is not the same fact as 90 from eight, and must never look identical. */}
                  {r.qualification && r.qualification.coverage.rated > 0 && (
                    <span
                      style={{ ...st.qual, ...(REC_STYLE[r.qualification.recommendation] ?? {}) }}
                      title={`${r.qualification.coverage.rated}/${r.qualification.coverage.total} dimensions rated · ${r.qualification.confidence} confidence${r.qualification.gaps.length ? ` · gaps: ${r.qualification.gaps.map((g) => g.label).join(', ')}` : ''}`}
                    >
                      · {r.qualification.score}/100 {REC_LABEL[r.qualification.recommendation]}
                    </span>
                  )}
                  {r.qualification && r.qualification.coverage.rated === 0 && <span style={st.unassessed}>· not qualified yet</span>}
                </div>
                {r.attention.gaps.length > 0 && (
                  <div style={st.chips}>
                    {r.attention.gaps.map((g) => (
                      <span key={g} style={st.chip}>{GAP_LABEL[g]}</span>
                    ))}
                  </div>
                )}
                {r.status !== 'converted' && r.status !== 'disqualified' && (
                  <ConvertControl
                    id={r.id}
                    state={convert[r.id]}
                    onStart={() => startConvert(r.id)}
                    onConvert={(createNew) => doConvert(r.id, createNew)}
                    onCancel={() => setC(r.id, null)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** G7 — Sources & Performance: which channels produce work, which produce records. */
function SourcesTable({ sources }: { sources: SourcePerformance[] }) {
  if (sources.length === 0) return <p style={st.empty}>No leads yet — no sources to measure.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={st.srcTable}>
        <thead>
          <tr>
            {['Source', 'Leads', 'Active', 'Converted', 'Disqualified', 'Nurture', 'Needs Attention', 'Conversion', 'Avg Age'].map((h) => (
              <th key={h} style={st.srcTh}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.source}>
              <td style={{ ...st.srcTd, fontWeight: 600, textTransform: s.source === 'unknown' ? 'none' : 'capitalize' }}>
                {s.source === 'unknown' ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>not recorded</span> : s.source.replace(/_/g, ' ')}
              </td>
              <td style={st.srcTdNum}>{s.total}</td>
              <td style={st.srcTdNum}>{s.active || '—'}</td>
              <td style={{ ...st.srcTdNum, color: s.converted ? 'var(--good)' : undefined, fontWeight: s.converted ? 700 : 400 }}>{s.converted || '—'}</td>
              <td style={{ ...st.srcTdNum, color: s.disqualified ? 'var(--bad)' : undefined }}>{s.disqualified || '—'}</td>
              <td style={st.srcTdNum}>{s.nurturing || '—'}</td>
              <td style={{ ...st.srcTdNum, color: s.needsAttention ? '#d97706' : undefined }}>{s.needsAttention || '—'}</td>
              <td style={{ ...st.srcTdNum, fontWeight: 700 }}>{s.conversionRate}%</td>
              <td style={st.srcTdNum}>{s.avgAgeDays}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConvertControl({
  state, onStart, onConvert, onCancel,
}: {
  id: string;
  state?: ConvertState;
  onStart: () => void;
  onConvert: (createNewAccount: boolean) => void;
  onCancel: () => void;
}) {
  if (!state) {
    return (
      <div style={st.actions}>
        <button style={st.convertBtn} onClick={onStart}>Convert →</button>
      </div>
    );
  }
  if (state.phase === 'busy') return <div style={st.actions}><span style={st.busy}>Working…</span></div>;
  if (state.phase === 'error') {
    return (
      <div style={st.actions}>
        <span style={st.err}>{state.message}</span>
        <button style={st.linkBtn} onClick={onStart}>Retry</button>
        <button style={st.linkBtn} onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  // preview
  const dup = state.dupConfidence && state.dupConfidence !== 'NONE';
  return (
    <div style={st.convertBox}>
      {dup ? (
        <>
          <span style={st.dupNote}>Possible duplicate account ({state.dupConfidence}).</span>
          <button style={st.primaryBtn} onClick={() => onConvert(false)}>Link &amp; Convert</button>
          <button style={st.linkBtn} onClick={() => onConvert(true)}>Create new</button>
        </>
      ) : (
        <>
          <span style={st.dupNote}>No duplicate found.</span>
          <button style={st.primaryBtn} onClick={() => onConvert(false)}>Convert</button>
        </>
      )}
      <button style={st.linkBtn} onClick={onCancel}>Cancel</button>
    </div>
  );
}

const st = {
  /** The qualification verdict, hoverable for the reasons — a number nobody can interrogate gets ignored. */
  qual: { fontWeight: 700, cursor: 'help' } as CSSProperties,
  unassessed: { color: 'var(--muted)', fontStyle: 'italic' } as CSSProperties,
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
  actions: { marginTop: 6 } as CSSProperties,
  convertBox: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 } as CSSProperties,
  convertBtn: { fontSize: 12, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' } as CSSProperties,
  primaryBtn: { fontSize: 12, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--fg)', background: 'var(--fg)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
  linkBtn: { fontSize: 12, padding: '3px 6px', borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' } as CSSProperties,
  dupNote: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  busy: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  err: { fontSize: 12, color: '#dc2626' } as CSSProperties,
  srcTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  srcTh: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  srcTd: { padding: '8px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  srcTdNum: { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as CSSProperties,
};
