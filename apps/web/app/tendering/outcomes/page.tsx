import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Outcomes & Reports — Pre-Award win/loss and hit-rate, from `/api/tendering/outcomes/analytics`
// and the recorded outcomes at `/api/tendering/outcomes`. Every figure is read; nothing fabricated.

interface Analytics {
  totalDecided: number;
  won: number;
  lost: number;
  winRate: number;
  wonValue: number;
  lostValue: number;
  topLossReasons: Array<{ reason: string; count: number }>;
}
interface Outcome {
  id: string;
  tenderTitle: string | null;
  result: string;
  ourBidValue: number;
  reason: string | null;
  decidedAt: string;
}

const AED = (n: number) => `AED ${Math.round(n).toLocaleString('en-AE')}`;

export default async function OutcomesReportsPage() {
  const [analytics, outcomes] = await Promise.all([
    getJson<Analytics>('/api/tendering/outcomes/analytics'),
    getJson<Outcome[]>('/api/tendering/outcomes'),
  ]);
  const a = analytics;
  const rows = [...(outcomes ?? [])].sort((x, y) => y.decidedAt.localeCompare(x.decidedAt)).slice(0, 12);
  const offline = !analytics && !outcomes;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Outcomes &amp; Reports</h1>
      <p style={st.sub}>Pre-Award performance — win rate, won/lost value and the reasons bids are lost, from recorded tender outcomes.</p>

      {offline ? (
        <p style={st.offline}>Live data unavailable — the API is offline.</p>
      ) : (
        <>
          <div style={st.kpiRow}>
            <Kpi label="Win rate" value={a ? `${a.winRate}%` : '—'} good />
            <Kpi label="Decided" value={a ? String(a.totalDecided) : '—'} />
            <Kpi label="Won / Lost" value={a ? `${a.won} / ${a.lost}` : '—'} />
            <Kpi label="Won value" value={a ? AED(a.wonValue) : '—'} accent />
            <Kpi label="Lost value" value={a ? AED(a.lostValue) : '—'} />
          </div>

          <div style={st.twoCol}>
            <section style={st.panel}>
              <h3 style={st.h3}>Recent outcomes</h3>
              {rows.length === 0 ? (
                <p style={st.muted}>No recorded outcomes yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={st.table}>
                    <thead><tr>{['Tender', 'Result', 'Our bid', 'Decided'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((o) => (
                        <tr key={o.id}>
                          <td style={st.td}>{o.tenderTitle ?? '—'}</td>
                          <td style={st.tdMuted}><span className="badge" style={{ color: o.result === 'won' ? 'var(--good)' : o.result === 'lost' ? 'var(--bad)' : undefined }}>{o.result}</span></td>
                          <td style={st.tdNum}>{AED(o.ourBidValue || 0)}</td>
                          <td style={st.tdMuted}>{o.decidedAt.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={st.panel}>
              <h3 style={st.h3}>Top loss reasons</h3>
              {!a || a.topLossReasons.length === 0 ? (
                <p style={st.muted}>No loss debriefs recorded.</p>
              ) : a.topLossReasons.map((r) => (
                <div key={r.reason} style={st.row}>
                  <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{r.reason}</span>
                  <span style={{ fontWeight: 700 }}>{r.count}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div style={st.kpiCard}>
      <span style={st.kpiLabel}>{label}</span>
      <span style={{ ...st.kpiVal, ...(accent ? { color: 'var(--accent)' } : good ? { color: 'var(--good)' } : {}) }}>{value}</span>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 },
  offline: { color: 'var(--muted)', padding: '18px 0' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 },
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 5 },
  kpiLabel: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiVal: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  h3: { fontSize: 14, fontWeight: 700, margin: '0 0 10px' },
  muted: { color: 'var(--muted)', fontSize: 13, padding: '6px 0' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '9px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '9px', borderBottom: '1px solid var(--border)', color: 'var(--text)' },
  tdMuted: { padding: '9px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' },
  tdNum: { padding: '9px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontSize: 13.5 },
};
