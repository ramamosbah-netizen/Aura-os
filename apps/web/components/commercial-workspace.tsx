'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import CommercialDecisionQueue from './commercial-decision-queue';
import NegotiationTab from './negotiation-tab';
import DocumentsTab from './documents-tab';
import type { EvidenceDoc, StoredRequirement } from './decision-readiness';
import { CommercialFinancials, CommercialRisks, commercialRisks } from './commercial-financials';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';

// CRM · Commercial workspace — one place for the commercial DECISION. Quotations and pricing
// are canonical execution surfaces elsewhere; this page only summarizes them and links to their
// owners. This realizes the "Commercial = Workspace, not a module" rule.

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
export interface CommQuotation {
  id: string; quoteNumber: string; customerName: string; accountId: string | null;
  sourceTenderId?: string | null; sourceOpportunityId?: string | null; convertedContractId?: string | null;
  ownerId?: string | null; terms?: string | null; revision?: number; parentQuotationId?: string | null;
  issueDate: string; validUntil: string | null; subtotal: number; vatTotal: number; total: number;
  status: string; lines: Line[];
}
export interface CommContract {
  id: string; title: string; reference: string | null; accountName: string | null;
  value: number; status: string; tenderTitle: string | null; commercialBaselineId: string | null; createdAt: string;
}
export interface CommSheet {
  tenderId: string; tenderTitle: string; reference: string | null; client: string | null; status: string;
  pricedItems: number; boqItems: number; directCost: number; sellingValue: number; tenderValue: number; marginPercent: number;
}
export interface CommercialPricingSummaryRow {
  quotationId: string; quoteNumber: string; revision: number; status: string; total: number;
  totalCost: number | null; profit: number | null; marginPercent: number | null; pricingKnown: boolean;
}

type Tab = 'overview' | 'approvals' | 'margins' | 'queue' | 'financials' | 'risks' | 'negotiation' | 'documents';
const TAB_DEFS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'The commercial picture + what needs a decision now' },
  { id: 'queue', label: 'Decision Queue', hint: 'Quotes awaiting a commercial decision — prioritize here, then open the source record' },
  { id: 'financials', label: 'Financials', hint: 'What the desk is carrying — and how much of it has a known margin' },
  { id: 'risks', label: 'Risks', hint: 'What is blocking or eroding the open quotes, aggregated' },
  { id: 'negotiation', label: 'Negotiation', hint: 'What the customer asked for, what we answered, and what it actually cost' },
  { id: 'documents', label: 'Documents', hint: 'The evidence behind each decision — who can see it, and who you have shared it with' },
  { id: 'approvals', label: 'Approvals', hint: 'Quotes awaiting internal approval' },
  { id: 'margins', label: 'Margins', hint: 'Quoted vs contracted value & conversion' },
];

const PRIMARY_TABS = new Set<Tab>(['overview', 'queue', 'financials', 'risks']);
const COMPAT_TABS = new Set<Tab>(['approvals', 'margins', 'negotiation', 'documents']);

const OPEN_STATUSES = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];
const aed = (n: number): string => 'AED ' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt = (iso: string): string => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });

export default function CommercialWorkspace({ quotations, contracts, sheets, evidence = [], requirements = [], pricingSummary, apiDown }: {
  quotations: CommQuotation[]; contracts: CommContract[]; sheets: CommSheet[];
  evidence?: EvidenceDoc[]; requirements?: StoredRequirement[]; pricingSummary?: CommercialPricingSummaryRow[]; apiDown: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  const kpi = useMemo(() => {
    const sum = (list: { total?: number; value?: number }[], k: 'total' | 'value') => list.reduce((s, x) => s + (x[k] ?? 0), 0);
    const awaiting = quotations.filter((q) => q.status === 'internal_review');
    const open = quotations.filter((q) => OPEN_STATUSES.includes(q.status));
    const accepted = quotations.filter((q) => q.status === 'accepted');
    const activeContracts = contracts.filter((c) => c.status !== 'cancelled');
    const decided = quotations.filter((q) => ['accepted', 'rejected', 'expired', 'cancelled'].includes(q.status));
    return {
      openValue: sum(open, 'total'), openCount: open.length,
      awaitingValue: sum(awaiting, 'total'), awaitingCount: awaiting.length,
      acceptedValue: sum(accepted, 'total'),
      contractedValue: sum(activeContracts, 'value'), contractCount: activeContracts.length,
      conversion: decided.length ? Math.round((accepted.length / decided.length) * 100) : 0,
    };
  }, [quotations, contracts]);

  const riskCount = useMemo(() => commercialRisks(quotations, pricingSummary).length, [quotations, pricingSummary]);

  const approvals = useMemo(() => quotations.filter((q) => q.status === 'internal_review'), [quotations]);

  return (
    <div style={st.shell}>
      <JourneyRail />
      <div style={st.viewSwitcher} role="tablist" aria-label="Commercial decision workspace views">
        <div style={st.switcherHeader}>
          <div>
            <span style={st.switcherEyebrow}>DECISION VIEWS</span>
            <p style={st.switcherCopy}>Choose a lens. Open the source record when work needs to happen.</p>
          </div>
          <span style={st.activeView}>Viewing <b>{TAB_DEFS.find((t) => t.id === tab)?.label}</b></span>
        </div>
        <ViewGroup label="Decide" tabs={TAB_DEFS.filter((t) => PRIMARY_TABS.has(t.id))} tab={tab} setTab={setTab} awaiting={kpi.awaitingCount} risks={riskCount} />
        <CanonicalOwners quotationCount={quotations.length} pricingCount={sheets.length} />
        <details style={st.compatGroup}>
          <summary style={st.compatSummary}>Compatibility views <span style={st.compatHint}>legacy-linked</span></summary>
          <div style={st.compatTabs}>
            <ViewGroup label="" tabs={TAB_DEFS.filter((t) => COMPAT_TABS.has(t.id))} tab={tab} setTab={setTab} awaiting={kpi.awaitingCount} risks={riskCount} />
          </div>
        </details>
      </div>
      <div style={st.hintLine}>{TAB_DEFS.find((t) => t.id === tab)?.hint}</div>

      {apiDown && <p style={st.muted}>API offline.</p>}

      {tab === 'overview' && (
        <>
          <div style={st.cards}>
            <Kpi label="Open quote value" value={aed(kpi.openValue)} sub={`${kpi.openCount} live`} accent />
            <Kpi label="Awaiting approval" value={aed(kpi.awaitingValue)} sub={`${kpi.awaitingCount} quote${kpi.awaitingCount === 1 ? '' : 's'}`} warn={kpi.awaitingCount > 0} />
            <Kpi label="Accepted (quotes)" value={aed(kpi.acceptedValue)} good />
            <Kpi label="Contracted" value={aed(kpi.contractedValue)} sub={`${kpi.contractCount} active`} good />
            <Kpi label="Quote → win" value={`${kpi.conversion}%`} />
          </div>
          <div style={st.decideRow}>
            {kpi.awaitingCount > 0
              ? <button type="button" style={st.decideBtn} onClick={() => setTab('queue')}>{kpi.awaitingCount} quote{kpi.awaitingCount === 1 ? '' : 's'} awaiting your approval →</button>
              : <span style={st.muted}>Nothing awaiting approval. The commercial desk is clear.</span>}
          </div>
          <div style={st.overviewGrid}>
            <div style={st.contextCard}>
              <span style={st.cardEyebrow}>WORK FROM THE RECORD</span>
              <h3 style={st.cardTitle}>Make the decision where the truth lives.</h3>
              <p style={st.cardCopy}>Use this workspace to prioritize. Open Quotation 360, Tender 360 or Contracts when you need to change something.</p>
              <div style={st.cardLinks}>
                <a href="/crm/quotations" style={st.cardLink}>Open quotations <span>↗</span></a>
                <a href="/tendering/tenders" style={st.cardLink}>Open tenders <span>↗</span></a>
                <a href="/contracts/contracts" style={st.cardLink}>Open contracts <span>↗</span></a>
              </div>
            </div>
            <div style={st.contextCard}>
              <span style={st.cardEyebrow}>CONTROL SIGNAL</span>
              <h3 style={st.cardTitle}>{riskCount > 0 ? `${riskCount} commercial risk${riskCount === 1 ? '' : 's'} need context.` : 'Commercial position is clear.'}</h3>
              <p style={st.cardCopy}>{riskCount > 0 ? 'Review the evidence and pricing projection before opening the canonical record.' : 'No pricing or readiness exception is currently surfaced by the decision model.'}</p>
              <button type="button" style={st.secondaryBtn} onClick={() => setTab(riskCount > 0 ? 'risks' : 'financials')}>{riskCount > 0 ? 'Review risks' : 'Review financials'} <span>→</span></button>
            </div>
          </div>
        </>
      )}

      {tab === 'negotiation' && <NegotiationTab quotations={quotations} />}
      {tab === 'documents' && <DocumentsTab quotations={quotations} />}
      {tab === 'queue' && <CommercialDecisionQueue quotations={quotations} contracts={contracts} evidence={evidence} requirements={requirements} />}

      {tab === 'financials' && <CommercialFinancials quotations={quotations} contracts={contracts} pricingSummary={pricingSummary} />}

      {tab === 'risks' && <CommercialRisks quotations={quotations} pricingSummary={pricingSummary} />}

      {tab === 'approvals' && (
        <LinkedTable
          note="Quotes in internal review — open each in Quotation 360 to approve or send back. Approval locks the commercial baseline the contract will inherit."
          head={['Quote', 'Customer', 'Value', 'Issued']}
          rows={approvals.map((q) => ({
            key: q.id, href: `/crm/quotations/${q.id}`,
            cells: [q.quoteNumber, q.customerName, aed(q.total), fmt(q.issueDate)],
          }))}
          empty="No quotes awaiting approval." />
      )}

      {tab === 'margins' && (
        <>
          <div style={st.cards}>
            <Kpi label="Total quoted (open)" value={aed(kpi.openValue)} accent />
            <Kpi label="Accepted" value={aed(kpi.acceptedValue)} good />
            <Kpi label="Contracted" value={aed(kpi.contractedValue)} good />
            <Kpi label="Quote → win" value={`${kpi.conversion}%`} />
          </div>
          <p style={st.muted}>
            Per-line cost margin lives in each quote's pricing sheet (Commercial → Pricing, or a quote's ⊞ Pricing) and in
            each tender's sheet. This roll-up tracks value and conversion; open a sheet for the cost build-up behind a number.
          </p>
        </>
      )}
    </div>
  );
}

function CanonicalOwners({ quotationCount, pricingCount }: { quotationCount: number; pricingCount: number }) {
  return (
    <section style={st.ownerStrip} aria-label="Canonical execution owners">
      <div style={st.ownerIntro}>
        <span style={st.groupLabel}>CANONICAL OWNERS</span>
        <span style={st.ownerCopy}>This workspace decides where to work. The source pages execute.</span>
      </div>
      <a href="/crm/quotations" style={st.ownerLink}>
        <span style={st.ownerLinkText}><b>Quotations</b><small>{quotationCount} records · CRM owner</small></span><span aria-hidden="true">↗</span>
      </a>
      <a href="/tendering/pricing" style={st.ownerLink}>
        <span style={st.ownerLinkText}><b>Pricing</b><small>{pricingCount} sheets · Tendering owner</small></span><span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}

function ViewGroup({ label, tabs, tab, setTab, awaiting, risks }: {
  label: string;
  tabs: Array<{ id: Tab; label: string; hint: string }>;
  tab: Tab;
  setTab: (tab: Tab) => void;
  awaiting: number;
  risks: number;
}) {
  return (
    <div style={st.tabGroup}>
      {label && <span style={st.groupLabel}>{label}</span>}
      <div style={st.viewCards}>
        {tabs.map((t) => {
          const badge = t.id === 'approvals' || t.id === 'queue' ? awaiting : t.id === 'risks' ? risks : 0;
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active} title={t.hint}
              style={{ ...st.viewCard, ...(active ? st.viewCardOn : {}) }} onClick={() => setTab(t.id)}>
              <span style={st.viewCardTop}>
                <span style={st.viewCardLabel}>{t.label}</span>
                {badge > 0 && <span style={{ ...st.badge, ...(active ? st.badgeOn : {}) }}>{badge}</span>}
              </span>
              <span style={st.viewCardHint}>{t.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JourneyRail() {
  const steps = [
    { label: 'Opportunity', href: '/crm/pipeline?view=board' },
    { label: 'Scope / BOQ', href: '/tendering/tenders' },
    { label: 'Estimation', href: '/tendering/pricing' },
    { label: 'Quotation', href: '/crm/quotations' },
    { label: 'Decision', href: '/crm/commercial' },
    { label: 'Contract', href: '/contracts/contracts' },
  ];
  return (
    <div style={st.journey} aria-label="Sales and Commercial journey">
      <div style={st.journeyTitle}>SALES &amp; COMMERCIAL FLOW <span>· one decision workspace</span></div>
      <div style={st.journeySteps}>
        {steps.map((step, index) => (
          <span key={step.label} style={st.journeyStepWrap}>
            <a href={step.href} style={st.journeyStep}>{step.label}</a>
            {index < steps.length - 1 && <span style={st.journeyArrow}>›</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, good, warn }: { label: string; value: string; sub?: string; accent?: boolean; good?: boolean; warn?: boolean }) {
  const color = accent ? 'var(--accent)' : good ? 'var(--good)' : warn ? 'var(--warn, var(--warn))' : 'var(--text)';
  return (
    <div style={st.kpi}>
      <span style={st.kpiLabel}>{label}</span>
      <span style={{ ...st.kpiVal, color }}>{value}</span>
      {sub && <span style={st.kpiSub}>{sub}</span>}
    </div>
  );
}

function LinkedTable({ note, head, rows, empty }: {
  note: ReactNode; head: string[]; rows: Array<{ key: string; href: string; cells: ReactNode[] }>; empty: string;
}) {
  return (
    <div>
      <p style={st.tableNote}>{note}</p>
      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead><tr>{head.map((h, i) => <th key={h} style={{ ...st.th, textAlign: i === 0 ? 'left' : i >= 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={head.length} style={{ ...st.td, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{empty}</td></tr>
              : rows.map((r) => (
                <tr key={r.key}>
                  {r.cells.map((c, i) => (
                    <td key={i} style={{ ...st.td, textAlign: i === 0 ? 'left' : i >= 2 ? 'right' : 'left' }}>
                      {i === 0 ? <a href={r.href} style={st.link}>{c}</a> : c}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', gap: 0 },
  journey: { border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', marginBottom: 14, background: 'linear-gradient(110deg, var(--panel-2), var(--panel))', boxShadow: 'var(--shadow-sm)' },
  journeyTitle: { color: 'var(--muted)', fontSize: 10.5, letterSpacing: 1.4, fontWeight: 800, marginBottom: 10 },
  journeySteps: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  journeyStepWrap: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  journeyStep: { color: 'var(--text)', fontSize: 12.5, fontWeight: 700, padding: '6px 9px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)' },
  journeyArrow: { color: 'var(--accent)', fontSize: 18, lineHeight: 1 },
  viewSwitcher: { border: '1px solid var(--border)', borderRadius: 16, padding: '14px 14px 12px', marginBottom: 10, background: 'linear-gradient(135deg, var(--panel-2), var(--panel))', boxShadow: 'var(--shadow-sm)' },
  switcherHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 },
  switcherEyebrow: { display: 'block', color: 'var(--accent)', fontSize: 10, letterSpacing: 1.4, fontWeight: 850, textTransform: 'uppercase' },
  switcherCopy: { color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' },
  activeView: { flexShrink: 0, color: 'var(--muted)', fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 999, padding: '6px 10px', background: 'var(--panel)' },
  tabGroup: { display: 'flex', flexDirection: 'column', gap: 3 },
  groupLabel: { color: 'var(--muted)', fontSize: 9.5, letterSpacing: 1.2, fontWeight: 800, padding: '0 2px', marginBottom: 4, textTransform: 'uppercase' },
  viewCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 },
  viewCard: { minHeight: 67, textAlign: 'left', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--panel)', color: 'var(--text)', padding: '10px 11px', cursor: 'pointer', transition: 'border-color 140ms ease, transform 140ms ease, background 140ms ease' },
  viewCardOn: { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, var(--panel))', boxShadow: '0 0 0 1px var(--accent-soft)' },
  viewCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  viewCardLabel: { fontSize: 13, fontWeight: 800 },
  viewCardHint: { display: 'block', color: 'var(--muted)', fontSize: 10.5, lineHeight: 1.35, marginTop: 5 },
  compatGroup: { marginLeft: 'auto', alignSelf: 'end', marginBottom: 4 },
  compatSummary: { cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, listStyle: 'none', padding: '8px 10px', border: '1px dashed var(--border-strong)', borderRadius: 8 },
  compatHint: { color: 'var(--accent)', fontSize: 10, marginLeft: 5 },
  compatTabs: { marginTop: 6, padding: 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel)' },
  ownerStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, alignItems: 'stretch', margin: '4px 0 2px' },
  ownerIntro: { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '8px 2px' },
  ownerCopy: { color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.35 },
  ownerLinkText: { display: 'flex', flexDirection: 'column', gap: 2 },
  ownerLink: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 11, color: 'var(--text)', textDecoration: 'none', background: 'var(--panel)', transition: 'border-color 140ms ease, background 140ms ease' },
  badge: { fontSize: 11, fontWeight: 800, background: 'var(--panel-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 999, padding: '0 7px', color: 'var(--text)' },
  badgeOn: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  hintLine: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel)', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiVal: { fontSize: 19, fontWeight: 800 },
  kpiSub: { fontSize: 11.5, color: 'var(--muted)' },
  decideRow: { marginBottom: 16 },
  decideBtn: { border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 18 },
  contextCard: { border: '1px solid var(--border)', borderRadius: 14, padding: '18px 18px 16px', background: 'linear-gradient(145deg, var(--panel), var(--panel-2))', minHeight: 170 },
  cardEyebrow: { color: 'var(--accent)', fontSize: 10, fontWeight: 800, letterSpacing: 1.3 },
  cardTitle: { margin: '8px 0 6px', fontSize: 17, lineHeight: 1.25, letterSpacing: -0.2 },
  cardCopy: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5, margin: 0, maxWidth: 480 },
  cardLinks: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 },
  cardLink: { color: 'var(--text)', fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--accent)', paddingBottom: 2 },
  secondaryBtn: { marginTop: 18, border: '1px solid var(--border-strong)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  tableNote: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 },
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 },
  th: { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  muted: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, padding: '4px 0' },
};
