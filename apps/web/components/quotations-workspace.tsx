'use client';

import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import QuotationsClient from './quotations-client';
import QuotationCreate from './quotation-create';

// Quotations OS — the quotation lifecycle as a workspace, the same UX as Pipeline: an Overview
// cockpit, a status BOARD (Draft → Review → Approved → Sent → Negotiation → Accepted), the full
// LIST (the existing enterprise table + actions, reused verbatim), and Analytics. Pure UI over the
// SAME /api/crm/quotations data — no route/API change.

interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  accountId: string | null;
  sourceTenderId?: string | null;
  sourceOpportunityId?: string | null;
  convertedContractId?: string | null;
  ownerId?: string | null;
  revision?: number;
  issueDate: string;
  validUntil: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
}

const aed = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const TABS = [
  { id: 'overview', label: 'Overview', icon: '◎' },
  { id: 'board', label: 'Board', icon: '⊞' },
  { id: 'list', label: 'List', icon: '≣' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Board columns map the user-facing stage to the REAL statuses behind it (no invented state).
const STAGES: Array<{ key: string; label: string; statuses: string[]; tone: string }> = [
  { key: 'draft', label: 'Draft', statuses: ['draft'], tone: 'var(--muted)' },
  { key: 'review', label: 'Review', statuses: ['internal_review'], tone: 'var(--warn, #d97706)' },
  { key: 'approved', label: 'Approved', statuses: ['approved'], tone: 'var(--accent)' },
  { key: 'sent', label: 'Sent', statuses: ['sent'], tone: 'var(--accent)' },
  { key: 'negotiation', label: 'Negotiation', statuses: ['under_negotiation', 'negotiation'], tone: 'var(--warn, #d97706)' },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted'], tone: 'var(--good)' },
  { key: 'lost', label: 'Lost', statuses: ['rejected', 'expired', 'cancelled'], tone: 'var(--bad)' },
];

export default function QuotationsWorkspace({ initialQuotations }: { initialQuotations: Quotation[] }) {
  const [tab, setTab] = useState<TabId>('overview');
  const quotes = initialQuotations;

  const m = useMemo(() => {
    const sum = (l: Quotation[]) => l.reduce((s, q) => s + q.total, 0);
    const by = (ss: string[]) => quotes.filter((q) => ss.includes(q.status));
    const draft = by(['draft', 'internal_review', 'approved']);
    const open = by(['sent', 'under_negotiation', 'negotiation']);
    const accepted = by(['accepted']);
    const lost = by(['rejected', 'expired', 'cancelled']);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const expiring = quotes.filter((q) => ['sent', 'under_negotiation', 'negotiation', 'approved'].includes(q.status) && q.validUntil && q.validUntil >= today && q.validUntil <= soon);
    const decided = accepted.length + lost.length;
    const pendingApproval = by(['internal_review']);
    const recent = [...quotes].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 6);
    return {
      draftValue: sum(draft), openValue: sum(open), acceptedValue: sum(accepted), lostValue: sum(lost),
      totalValue: sum(quotes), avgDeal: quotes.length ? sum(quotes) / quotes.length : 0,
      acceptanceRate: decided > 0 ? Math.round((accepted.length / decided) * 100) : null,
      expiring, pendingApproval, recent, count: quotes.length,
    };
  }, [quotes]);

  return (
    <>
      {/* Internal workspace tabs (same pattern as Pipeline) */}
      <div style={st.tabbar} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setTab(t.id)} style={tab === t.id ? { ...st.tab, ...st.tabActive } : st.tab}>
            <span style={{ opacity: 0.8 }}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}><QuotationCreate /></div>
      </div>

      {tab === 'overview' && <Overview m={m} />}
      {tab === 'board' && <Board quotes={quotes} />}
      {tab === 'list' && <QuotationsClient initialQuotations={quotes as never} embedded />}
      {tab === 'analytics' && <Analytics quotes={quotes} m={m} />}
    </>
  );
}

function Overview({ m }: { m: OverviewShape }) {
  return (
    <>
      <div style={st.cards}>
        <Kpi label="Total quoted" value={`AED ${aed(m.totalValue)}`} />
        <Kpi label="Open / sent value" value={`AED ${aed(m.openValue)}`} accent />
        <Kpi label="Accepted value" value={`AED ${aed(m.acceptedValue)}`} good />
        <Kpi label="Acceptance rate" value={m.acceptanceRate === null ? '—' : `${m.acceptanceRate}%`} accent />
        <Kpi label="Avg deal size" value={`AED ${aed(m.avgDeal)}`} />
        <Kpi label="Expiring ≤ 7 days" value={String(m.expiring.length)} bad={m.expiring.length > 0} />
      </div>

      <div style={st.twoCol}>
        <section className="panel" style={st.panel}>
          <h3 style={st.h3}>Pending your approval <span style={st.count}>{m.pendingApproval.length}</span></h3>
          {m.pendingApproval.length === 0
            ? <p style={st.muted}>Nothing in internal review.</p>
            : m.pendingApproval.map((q) => <QuoteRow key={q.id} q={q} right={`AED ${aed(q.total)}`} />)}
        </section>
        <section className="panel" style={st.panel}>
          <h3 style={st.h3}>Recent quotations</h3>
          {m.recent.length === 0
            ? <p style={st.muted}>No quotations yet.</p>
            : m.recent.map((q) => <QuoteRow key={q.id} q={q} right={<span className="badge">{q.status.replace(/_/g, ' ')}</span>} />)}
        </section>
      </div>

      {m.expiring.length > 0 && (
        <section className="panel" style={{ ...st.panel, borderColor: 'var(--bad)' }}>
          <h3 style={st.h3}>⚠ Expiring within 7 days <span style={st.count}>{m.expiring.length}</span></h3>
          {m.expiring.map((q) => <QuoteRow key={q.id} q={q} right={<span style={{ color: 'var(--bad)' }}>valid to {q.validUntil}</span>} />)}
        </section>
      )}
    </>
  );
}

function Board({ quotes }: { quotes: Quotation[] }) {
  const known = new Set(STAGES.flatMap((s) => s.statuses));
  const superseded = quotes.filter((q) => !known.has(q.status)); // revised / any other → not lost, kept visible
  return (
    <div style={st.boardScroll}>
      <div style={st.board}>
        {STAGES.map((stage) => {
          const list = quotes.filter((q) => stage.statuses.includes(q.status));
          const value = list.reduce((s, q) => s + q.total, 0);
          return (
            <div key={stage.key} style={st.col}>
              <div style={{ ...st.colHead, borderTopColor: stage.tone }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{stage.label}</span>
                <span style={st.colCount}>{list.length}</span>
                <span style={st.colValue}>AED {aed(value)}</span>
              </div>
              <div style={st.colBody}>
                {list.length === 0 ? <p style={st.colEmpty}>—</p> : list.map((q) => <Card key={q.id} q={q} />)}
              </div>
            </div>
          );
        })}
        {superseded.length > 0 && (
          <div key="superseded" style={st.col}>
            <div style={{ ...st.colHead, borderTopColor: 'var(--border)', opacity: 0.7 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Superseded</span>
              <span style={st.colCount}>{superseded.length}</span>
            </div>
            <div style={st.colBody}>{superseded.map((q) => <Card key={q.id} q={q} muted />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Analytics({ quotes, m }: { quotes: Quotation[]; m: OverviewShape }) {
  const maxVal = Math.max(1, ...STAGES.map((s) => quotes.filter((q) => s.statuses.includes(q.status)).reduce((t, q) => t + q.total, 0)));
  const src = {
    opportunity: quotes.filter((q) => q.sourceOpportunityId).length,
    tender: quotes.filter((q) => q.sourceTenderId && !q.sourceOpportunityId).length,
    direct: quotes.filter((q) => !q.sourceOpportunityId && !q.sourceTenderId).length,
  };
  return (
    <div style={st.twoCol}>
      <section className="panel" style={st.panel}>
        <h3 style={st.h3}>Value by stage</h3>
        {STAGES.map((s) => {
          const list = quotes.filter((q) => s.statuses.includes(q.status));
          const v = list.reduce((t, q) => t + q.total, 0);
          return (
            <div key={s.key} style={st.barRow}>
              <span style={st.barLabel}>{s.label}</span>
              <div style={st.barTrack}><div style={{ ...st.barFill, width: `${(v / maxVal) * 100}%`, background: s.tone }} /></div>
              <span style={st.barVal}>AED {aed(v)} · {list.length}</span>
            </div>
          );
        })}
      </section>
      <section className="panel" style={st.panel}>
        <h3 style={st.h3}>Outcomes & sources</h3>
        <div style={st.statGrid}>
          <Stat label="Acceptance rate" value={m.acceptanceRate === null ? '—' : `${m.acceptanceRate}%`} tone="var(--good)" />
          <Stat label="Accepted value" value={`AED ${aed(m.acceptedValue)}`} tone="var(--good)" />
          <Stat label="Lost value" value={`AED ${aed(m.lostValue)}`} tone="var(--bad)" />
          <Stat label="Avg deal size" value={`AED ${aed(m.avgDeal)}`} />
        </div>
        <h4 style={{ ...st.h3, fontSize: 12.5, marginTop: 16 }}>Where quotes come from</h4>
        <div style={st.barRow}><span style={st.barLabel}>◎ Opportunity</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.opportunity, m.count)}%`, background: 'var(--accent)' }} /></div><span style={st.barVal}>{src.opportunity}</span></div>
        <div style={st.barRow}><span style={st.barLabel}>◳ Tender</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.tender, m.count)}%`, background: 'var(--accent)' }} /></div><span style={st.barVal}>{src.tender}</span></div>
        <div style={st.barRow}><span style={st.barLabel}>Direct</span><div style={st.barTrack}><div style={{ ...st.barFill, width: `${pct(src.direct, m.count)}%`, background: 'var(--muted)' }} /></div><span style={st.barVal}>{src.direct}</span></div>
      </section>
    </div>
  );
}

// ── small pieces ──
type OverviewShape = {
  totalValue: number; openValue: number; acceptedValue: number; lostValue: number; avgDeal: number;
  acceptanceRate: number | null; expiring: Quotation[]; pendingApproval: Quotation[]; recent: Quotation[]; count: number;
};
const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

function Card({ q, muted }: { q: Quotation; muted?: boolean }) {
  return (
    <a href={`/crm/quotations/${q.id}`} style={{ ...st.card2, ...(muted ? { opacity: 0.6 } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{q.quoteNumber}{q.revision ? ` · R${q.revision}` : ''}</span>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>AED {aed(q.total)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customerName}</div>
      {q.validUntil && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>valid to {q.validUntil}</div>}
    </a>
  );
}
function QuoteRow({ q, right }: { q: Quotation; right: ReactNode }) {
  return (
    <a href={`/crm/quotations/${q.id}`} style={st.qrow}>
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{q.quoteNumber}</span>
      <span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customerName}</span>
      <span style={{ fontSize: 12.5 }}>{right}</span>
    </a>
  );
}
function Kpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : good ? { color: 'var(--good)' } : bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)' }}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 3, color: tone ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

const st = {
  tabbar: { display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18, paddingBottom: 2 } as CSSProperties,
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13.5, color: 'var(--muted)', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit' } as CSSProperties,
  tabActive: { color: 'var(--text)', fontWeight: 700, borderBottomColor: 'var(--accent)' } as CSSProperties,
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 } as CSSProperties,
  panel: { padding: 16 } as CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  count: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft, rgba(247,178,59,.12))', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, padding: '6px 0' } as CSSProperties,
  qrow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' } as CSSProperties,
  boardScroll: { overflowX: 'auto', paddingBottom: 8 } as CSSProperties,
  board: { display: 'flex', gap: 12, minWidth: 'min-content' } as CSSProperties,
  col: { width: 220, flexShrink: 0, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column' } as CSSProperties,
  colHead: { padding: '10px 12px', borderTop: '3px solid var(--accent)', borderTopLeftRadius: 12, borderTopRightRadius: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, alignItems: 'center' } as CSSProperties,
  colCount: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--panel-2)', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  colValue: { gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  colBody: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60, maxHeight: '62vh', overflowY: 'auto' } as CSSProperties,
  colEmpty: { color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '10px 0' } as CSSProperties,
  card2: { display: 'block', padding: 10, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel-2)', textDecoration: 'none', color: 'var(--text)' } as CSSProperties,
  barRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0' } as CSSProperties,
  barLabel: { width: 96, fontSize: 12, color: 'var(--muted)', flexShrink: 0 } as CSSProperties,
  barTrack: { flex: 1, height: 8, background: 'var(--panel-2)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', borderRadius: 999 } as CSSProperties,
  barVal: { width: 130, textAlign: 'right', fontSize: 12, color: 'var(--muted)', flexShrink: 0 } as CSSProperties,
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } as CSSProperties,
};
