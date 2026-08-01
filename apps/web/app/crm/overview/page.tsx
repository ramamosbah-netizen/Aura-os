import type { CSSProperties, ReactNode } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Sales Overview — the workspace cockpit (Phase 4). Aggregates the pipeline command centre
// (KPIs · weighted forecast · at-risk deals with rule-based next-steps) and the quotation book
// into one front door. Every number is READ from live endpoints — no fabricated figures.

interface Kpis {
  openDeals: number; openValue: number; weighted: number; avgDealSize: number;
  avgAgeDays: number; winRate: number | null; won90: number; wonValue90: number; lost90: number;
}
interface AtRisk {
  id: string; title: string; value: number; stage: string; ownerId: string | null;
  accountName: string | null; reasons: string[]; recommendation: string; daysSinceActivity: number | null;
}
interface Pipeline { kpis: Kpis; atRisk: AtRisk[] }
interface Quote { id: string; quoteNumber: string; customerName: string; total: number; status: string; issueDate: string }

const aed = (n: number): string => 'AED ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default async function SalesOverviewPage() {
  const [pipe, quotes] = await Promise.all([
    getJson<Pipeline>('/api/crm/opportunities/pipeline'),
    getJson<Quote[]>('/api/crm/quotations'),
  ]);

  const k = pipe?.kpis;
  const atRisk = (pipe?.atRisk ?? []).slice(0, 6);
  const qs = quotes ?? [];
  const openQuoteValue = qs.filter((q) => ['sent', 'under_negotiation', 'negotiation', 'approved'].includes(q.status)).reduce((s, q) => s + q.total, 0);
  const acceptedValue = qs.filter((q) => q.status === 'accepted').reduce((s, q) => s + q.total, 0);
  const recentQuotes = [...qs].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 6);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Sales · Overview</h1>
      <p style={st.sub}>The sales cockpit — pipeline health, forecast, the deals that need you today, and the quotation book, in one place.</p>

      {!pipe && !quotes ? (
        <p style={st.offline}>Live data unavailable — the API is offline. The cockpit fills in as soon as it is back.</p>
      ) : (
        <>
          <div style={st.cards}>
            <Kpi label="Open pipeline" value={k ? aed(k.openValue) : '—'} sub={k ? `${k.openDeals} open deals` : ''} accent />
            <Kpi label="Weighted forecast" value={k ? aed(k.weighted) : '—'} sub="probability-adjusted" />
            <Kpi label="Win rate (90d)" value={k?.winRate == null ? '—' : `${k.winRate}%`} sub={k ? `${k.won90}W · ${k.lost90}L` : ''} good />
            <Kpi label="Avg deal size" value={k ? aed(k.avgDealSize) : '—'} sub={k ? `avg age ${k.avgAgeDays}d` : ''} />
            <Kpi label="Quotes out" value={aed(openQuoteValue)} sub="sent / in review" />
            <Kpi label="Accepted (quotes)" value={aed(acceptedValue)} sub="won this book" good />
          </div>

          <div style={st.twoCol}>
            <section className="panel" style={st.panel}>
              <h3 style={st.h3}>Needs attention <span style={st.count}>{pipe?.atRisk.length ?? 0}</span></h3>
              <p style={st.hint}>Open deals flagged by the pipeline engine, most valuable first — with the next best step.</p>
              {atRisk.length === 0 ? (
                <p style={st.muted}>No at-risk deals — the pipeline is clean.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {atRisk.map((o) => (
                    <a key={o.id} href={`/crm/opportunities/${o.id}`} style={st.risk}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{o.title}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{aed(o.value)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 6px' }}>{o.accountName ?? 'No account'} · {o.stage}</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                        {o.reasons.map((r, i) => <span key={i} style={st.reason}>{r}</span>)}
                      </div>
                      <div style={st.rec}>→ {o.recommendation}</div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" style={st.panel}>
              <h3 style={st.h3}>Recent quotations</h3>
              {recentQuotes.length === 0 ? (
                <p style={st.muted}>No quotations yet.</p>
              ) : (
                recentQuotes.map((q) => (
                  <a key={q.id} href={`/crm/quotations/${q.id}`} style={st.qrow}>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{q.quoteNumber}</span>
                    <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customerName}</span>
                    <span className="badge">{q.status.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{aed(q.total)}</span>
                  </a>
                ))
              )}
              <div style={st.links}>
                <a href="/crm/leads" style={st.link}>Pipeline →</a>
                <a href="/crm/quotations" style={st.link}>Quotations →</a>
                <a href="/crm/accounts" style={st.link}>Accounts →</a>
                <a href="/crm/activities" style={st.link}>Activities →</a>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, good }: { label: string; value: string; sub?: string; accent?: boolean; good?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : good ? { color: 'var(--good)' } : {}) }}>{value}</div>
      {sub ? <div style={st.cardSub}>{sub}</div> : null}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 },
  offline: { color: 'var(--muted)', padding: '18px 0' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 },
  card: { padding: '13px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' },
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardVal: { fontSize: 20, fontWeight: 800, marginTop: 4 },
  cardSub: { fontSize: 11, color: 'var(--muted)', marginTop: 3 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 },
  panel: { padding: 16 },
  h3: { fontSize: 14, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 },
  hint: { fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' },
  count: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft, rgba(247,178,59,.12))', borderRadius: 999, padding: '1px 8px' },
  muted: { color: 'var(--muted)', fontSize: 13, padding: '6px 0' },
  risk: { display: 'block', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', textDecoration: 'none', color: 'var(--text)' },
  reason: { fontSize: 11, color: 'var(--bad)', background: 'var(--bad-soft, rgba(242,104,107,.12))', borderRadius: 6, padding: '1px 7px' },
  rec: { fontSize: 12, color: 'var(--accent)', fontWeight: 600 },
  qrow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', fontSize: 13 },
  links: { display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 13 },
};
