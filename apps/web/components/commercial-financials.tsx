'use client';

import type { CSSProperties } from 'react';
import type { CommQuotation, CommContract } from './commercial-workspace';

// Portfolio-level financials and risk — the aggregate view. Quotation 360 answers
// "what is this quote worth"; this answers "what is the desk carrying, and what is
// stopping it". Same data, different question.
//
// WHAT IS DELIBERATELY ABSENT: expected profit, gross margin and margin %. They are
// the first things a commercial summary usually shows, and they cannot be computed
// here — measured on this tenant, ZERO of ten open quotations carry any unitCost.
// Rendering "AED 0 profit" against AED 5.5M of live quotes would be a confident lie.
// Instead, margin coverage is reported as what it is: a gap, sized.

const aed = (n: number): string => 'AED ' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const OPEN = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];

const today = (): string => new Date().toISOString().slice(0, 10);
const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const daysSince = (iso: string): number => {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / 86400000));
};
const lineCost = (q: CommQuotation): number =>
  (q.lines ?? []).reduce((s, l) => s + ((l as { unitCost?: number }).unitCost ?? 0) * ((l as { quantity?: number }).quantity ?? 0), 0);
const isCosted = (q: CommQuotation): boolean => lineCost(q) > 0;

export function CommercialFinancials({ quotations, contracts }: {
  quotations: CommQuotation[]; contracts: CommContract[];
}) {
  const open = quotations.filter((q) => OPEN.includes(q.status));
  const awaiting = open.filter((q) => q.status === 'internal_review');
  const accepted = quotations.filter((q) => q.status === 'accepted');
  const activeContracts = contracts.filter((c) => c.status !== 'cancelled');
  const sum = (list: CommQuotation[]): number => list.reduce((s, q) => s + (q.total ?? 0), 0);

  const costed = open.filter(isCosted);
  const coverage = open.length ? Math.round((costed.length / open.length) * 100) : 0;
  const uncostedValue = sum(open.filter((q) => !isCosted(q)));

  return (
    <>
      <div style={st.grid}>
        <Money label="Open quote value" value={aed(sum(open))} sub={`${open.length} live`} tone="accent" />
        <Money label="Awaiting approval" value={aed(sum(awaiting))} sub={`${awaiting.length} quote${awaiting.length === 1 ? '' : 's'}`} tone={awaiting.length ? 'warn' : undefined} />
        <Money label="Accepted (not yet contracted)" value={aed(sum(accepted.filter((q) => !q.convertedContractId)))} sub={`${accepted.filter((q) => !q.convertedContractId).length} to convert`} tone="good" />
        <Money label="Contracted" value={aed(activeContracts.reduce((s, c) => s + (c.value ?? 0), 0))} sub={`${activeContracts.length} active`} tone="good" />
      </div>

      {/* The margin gap, stated rather than faked. */}
      <div style={{ ...st.panel, borderColor: coverage === 0 ? 'var(--bad)' : coverage < 60 ? 'var(--warn)' : 'var(--border)' }}>
        <div style={st.panelHead}>
          <b>Margin visibility</b>
          <span style={st.panelNum}>{coverage}% of open quotes costed</span>
        </div>
        <p style={st.panelBody}>
          {costed.length} of {open.length} open quotations carry a unit cost, so profit and margin
          cannot be computed for the other {open.length - costed.length} — <b>{aed(uncostedValue)}</b>{' '}of
          live quotes whose margin is unknown. Expected profit is deliberately not shown here rather
          than shown as zero. Build the cost-up on a quote&apos;s pricing sheet and it becomes
          measurable.
        </p>
      </div>
    </>
  );
}

export interface RiskBucket { key: string; label: string; count: number; value: number; tone: 'bad' | 'warn' | 'muted'; detail: string }

/** Aggregate risk across the desk — counts and money, never a score. */
export function commercialRisks(quotations: CommQuotation[]): RiskBucket[] {
  const open = quotations.filter((q) => OPEN.includes(q.status));
  const t = today();
  const soon = inDays(7);
  const val = (l: CommQuotation[]): number => l.reduce((s, q) => s + (q.total ?? 0), 0);

  const lapsed = open.filter((q) => q.validUntil && q.validUntil < t);
  const expiring = open.filter((q) => q.validUntil && q.validUntil >= t && q.validUntil <= soon);
  const noValidity = open.filter((q) => !q.validUntil);
  const noCost = open.filter((q) => !isCosted(q));
  const stalledApproval = open.filter((q) => q.status === 'internal_review' && daysSince(q.issueDate) >= 3);
  const noLines = open.filter((q) => !(q.lines ?? []).length);

  const buckets: RiskBucket[] = [
    { key: 'lapsed', label: 'Validity lapsed', count: lapsed.length, value: val(lapsed), tone: 'bad', detail: 'Past their valid-until date — revise or re-confirm before quoting again.' },
    { key: 'expiring', label: 'Expiring within 7 days', count: expiring.length, value: val(expiring), tone: 'warn', detail: 'Chase a decision this week or the price has to be re-issued.' },
    { key: 'no-validity', label: 'No validity date', count: noValidity.length, value: val(noValidity), tone: 'warn', detail: 'Nothing expires them, so they can never be flagged as stale. Auto-drafted quotes arrive this way.' },
    { key: 'no-cost', label: 'Margin unknown', count: noCost.length, value: val(noCost), tone: 'bad', detail: 'No unit cost on any line — the quote can be approved without anyone seeing the margin.' },
    { key: 'stalled', label: 'Waiting 3+ days for approval', count: stalledApproval.length, value: val(stalledApproval), tone: 'warn', detail: 'Sitting in internal review. Every day here is a day the customer is not answered.' },
    { key: 'no-lines', label: 'No lines', count: noLines.length, value: val(noLines), tone: 'muted', detail: 'An empty quote — priced at zero or never filled in.' },
  ];
  return buckets.filter((b) => b.count > 0);
}

export function CommercialRisks({ quotations }: { quotations: CommQuotation[] }) {
  const buckets = commercialRisks(quotations);
  if (buckets.length === 0) {
    return <p style={st.clear}>No commercial risk on the open desk — every live quote is costed, dated and moving.</p>;
  }
  return (
    <div style={st.riskList}>
      {buckets.map((b) => (
        <div key={b.key} style={{ ...st.risk, borderLeftColor: b.tone === 'bad' ? 'var(--bad)' : b.tone === 'warn' ? 'var(--warn)' : 'var(--border-strong)' }}>
          <div style={st.riskTop}>
            <b>{b.label}</b>
            <span style={st.riskCount}>
              {b.count} quote{b.count === 1 ? '' : 's'} · {aed(b.value)}
            </span>
          </div>
          <p style={st.riskDetail}>{b.detail}</p>
        </div>
      ))}
    </div>
  );
}

function Money({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'accent' | 'good' | 'warn' }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : 'var(--text)';
  return (
    <div style={st.card}>
      <div style={{ ...st.cardVal, color }}>{value}</div>
      <div style={st.cardLab}>{label}</div>
      {sub && <div style={st.cardSub}>{sub}</div>}
    </div>
  );
}

const st = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' } as CSSProperties,
  cardVal: { fontSize: 20, fontWeight: 600, letterSpacing: -0.3 } as CSSProperties,
  cardLab: { color: 'var(--muted)', fontSize: 12, marginTop: 4 } as CSSProperties,
  cardSub: { color: 'var(--muted)', fontSize: 11, marginTop: 2 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderLeftWidth: 3, borderRadius: 10, padding: '14px 16px' } as CSSProperties,
  panelHead: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 14, marginBottom: 6 } as CSSProperties,
  panelNum: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  panelBody: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6, margin: 0 } as CSSProperties,
  riskList: { display: 'flex', flexDirection: 'column', gap: 10 } as CSSProperties,
  risk: { background: 'var(--panel)', border: '1px solid var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderRadius: 10, padding: '12px 14px' } as CSSProperties,
  riskTop: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13.5 } as CSSProperties,
  riskCount: { color: 'var(--muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  riskDetail: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.55, margin: '5px 0 0' } as CSSProperties,
  clear: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 } as CSSProperties,
};
