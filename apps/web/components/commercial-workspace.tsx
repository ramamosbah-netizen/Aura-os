'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import QuotationsClient from './quotations-client';
import CommercialDecisionQueue from './commercial-decision-queue';
import NegotiationTab from './negotiation-tab';
import type { EvidenceDoc, StoredRequirement } from './decision-readiness';
import { CommercialFinancials, CommercialRisks, commercialRisks } from './commercial-financials';

// CRM · Commercial workspace — one place for the commercial DECISION. Tabs are LINKED
// VIEWS onto records owned by their domains: Quotations (CRM), Pricing (Tendering),
// Contracts (Deal chain). Nothing is owned or duplicated here — every row links back to
// the record's home. This realizes the "Commercial = Workspace, not a module" rule.

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

type Tab = 'overview' | 'quotations' | 'pricing' | 'approvals' | 'margins' | 'queue' | 'financials' | 'risks' | 'negotiation';
const TAB_DEFS: Array<{ id: Tab; label: string; icon: string; hint: string }> = [
  { id: 'overview', label: 'Overview', icon: '◎', hint: 'The commercial picture + what needs a decision now' },
  { id: 'queue', label: 'Decision Queue', icon: '📋', hint: 'Quotes awaiting a commercial decision — review and clear them here' },
  { id: 'quotations', label: 'Quotations', icon: '✎', hint: 'Customer quotes (owned by CRM)' },
  { id: 'pricing', label: 'Pricing', icon: '⊞', hint: 'Internal cost & margin sheets (owned by Tendering)' },
  { id: 'financials', label: 'Financials', icon: '📊', hint: 'What the desk is carrying — and how much of it has a known margin' },
  { id: 'risks', label: 'Risks', icon: '⚠', hint: 'What is blocking or eroding the open quotes, aggregated' },
  { id: 'negotiation', label: 'Negotiation', icon: '⇄', hint: 'What the customer asked for, what we answered, and what it actually cost' },
  { id: 'approvals', label: 'Approvals', icon: '✔', hint: 'Quotes awaiting internal approval' },
  { id: 'margins', label: 'Margins', icon: '％', hint: 'Quoted vs contracted value & conversion' },
];

const OPEN_STATUSES = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];
const aed = (n: number): string => 'AED ' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmt = (iso: string): string => new Date(iso).toLocaleDateString();
const cap = (s: string): string => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function CommercialWorkspace({ quotations, contracts, sheets, evidence = [], requirements = [], apiDown }: {
  quotations: CommQuotation[]; contracts: CommContract[]; sheets: CommSheet[];
  evidence?: EvidenceDoc[]; requirements?: StoredRequirement[]; apiDown: boolean;
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

  const riskCount = useMemo(() => commercialRisks(quotations).length, [quotations]);

  const approvals = useMemo(() => quotations.filter((q) => q.status === 'internal_review'), [quotations]);

  return (
    <div>
      <div style={st.tabBar} role="tablist">
        {TAB_DEFS.map((t) => {
          const badge = t.id === 'approvals' || t.id === 'queue' ? kpi.awaitingCount : t.id === 'risks' ? riskCount : 0;
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active} title={t.hint}
              style={{ ...st.tab, ...(active ? st.tabOn : {}) }} onClick={() => setTab(t.id)}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
              {badge > 0 && <span style={{ ...st.badge, ...(active ? st.badgeOn : {}) }}>{badge}</span>}
            </button>
          );
        })}
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
        </>
      )}

      {tab === 'negotiation' && <NegotiationTab quotations={quotations} />}
      {tab === 'queue' && <CommercialDecisionQueue quotations={quotations} contracts={contracts} evidence={evidence} requirements={requirements} />}

      {tab === 'financials' && <CommercialFinancials quotations={quotations} contracts={contracts} />}

      {tab === 'risks' && <CommercialRisks quotations={quotations} />}

      {tab === 'quotations' && <QuotationsClient initialQuotations={quotations} />}

      {tab === 'pricing' && (
        <LinkedTable
          note={<>Internal cost & resource build-ups, owned by Tendering. <a href="/tendering/pricing" style={st.link}>Full pricing summary →</a></>}
          head={['Tender', 'Client', 'Status', 'Priced', 'Selling value', 'Margin']}
          rows={sheets.map((s) => ({
            key: s.tenderId, href: `/tendering/tenders/${s.tenderId}/pricing`,
            cells: [s.tenderTitle, s.client ?? '—', cap(s.status), `${s.pricedItems}/${s.boqItems}`, aed(s.sellingValue), `${s.marginPercent}%`],
          }))}
          empty="No pricing sheets yet." />
      )}

      {tab === 'approvals' && (
        <LinkedTable
          note="Quotes in internal review — open each to approve or send back. Approval locks the commercial baseline the contract will inherit."
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

function Kpi({ label, value, sub, accent, good, warn }: { label: string; value: string; sub?: string; accent?: boolean; good?: boolean; warn?: boolean }) {
  const color = accent ? 'var(--accent)' : good ? 'var(--good)' : warn ? 'var(--warn, #d97706)' : 'var(--fg)';
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
  tabBar: { display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 8 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', color: 'var(--muted)', padding: '10px 16px', fontSize: 14, cursor: 'pointer', borderBottomWidth: 2.5, borderBottomStyle: 'solid', borderBottomColor: 'transparent', marginBottom: -1, fontWeight: 600 },
  tabOn: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  badge: { fontSize: 11, fontWeight: 800, background: 'var(--panel-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 999, padding: '0 7px', color: 'var(--fg)' },
  badgeOn: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  hintLine: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 16px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 },
  kpi: { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--panel)', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiVal: { fontSize: 19, fontWeight: 800 },
  kpiSub: { fontSize: 11.5, color: 'var(--muted)' },
  decideRow: { marginBottom: 16 },
  decideBtn: { border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  tableNote: { fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 },
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 },
  th: { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  muted: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, padding: '4px 0' },
};
