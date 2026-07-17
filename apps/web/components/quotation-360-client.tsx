'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Timeline from './timeline';
import {
  RecordShell, RecordHeader, ActionButton, RecordCard, InfoRow, CardGrid, InsightsPanel,
  useTab, type Tone, type KpiItem, type Insight, type TabDef, type MetaItem,
} from './crm/record-shell';

// Quotation 360 — the commercial document command center on the shared CRM
// record-shell: Header + lifecycle Actions, KPIs (value/margin/validity), fixed
// Tabs (Overview / Pricing / Revisions / Activity), Insights rail, Timeline foot.

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
export interface Quotation {
  id: string; quoteNumber: string; customerName: string; accountId: string | null; contactName: string | null;
  ownerId: string | null; terms: string | null; revision: number; status: string;
  sourceTenderId: string | null; sourceOpportunityId: string | null; convertedContractId: string | null;
  issueDate: string; validUntil: string | null; lines: Line[]; subtotal: number; vatTotal: number; total: number;
  pricing: { unitCosts: number[] } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', internal_review: 'Internal review', approved: 'Approved', sent: 'Sent',
  under_negotiation: 'Under negotiation', revised: 'Revised', accepted: 'Accepted',
  rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled',
};
const statusTone = (s: string): Tone =>
  s === 'accepted' ? 'good'
    : s === 'rejected' || s === 'expired' || s === 'cancelled' ? 'bad'
      : s === 'under_negotiation' ? 'warn'
        : s === 'approved' || s === 'sent' ? 'accent' : 'neutral';
const OPEN_STATUSES = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];

const money = (n: number): string => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const aed0 = (n: number): string => `AED ${Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const pct = (n: number): string => `${n.toFixed(1)}%`;

export default function Quotation360Client({ quotation: q, revisions }: { quotation: Quotation; revisions: Quotation[] }) {
  const router = useRouter();
  const [tab, setTab] = useTab('overview');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── Pricing composition (quotation sheet ↔ pricing engine) ──────────────────
  const pricing = useMemo(() => {
    const costs = q.pricing?.unitCosts;
    if (!costs || costs.length !== q.lines.length) return null;
    const rows = q.lines.map((l, i) => {
      const lineCost = l.quantity * costs[i];
      const margin = l.lineNet - lineCost;
      return { ...l, unitCost: costs[i], lineCost, margin, marginPct: l.lineNet > 0 ? (margin / l.lineNet) * 100 : 0 };
    });
    const totalCost = rows.reduce((s, r) => s + r.lineCost, 0);
    const totalMargin = q.subtotal - totalCost;
    return { rows, totalCost, totalMargin, marginPct: q.subtotal > 0 ? (totalMargin / q.subtotal) * 100 : 0 };
  }, [q]);

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const isOpen = OPEN_STATUSES.includes(q.status);
  const expiresSoon = isOpen && !!q.validUntil && q.validUntil >= today && q.validUntil <= soon;
  const pastValidity = isOpen && !!q.validUntil && q.validUntil < today;

  // ── Lifecycle actions (same API as the register page) ───────────────────────
  const act = async (action: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const revise = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/revise`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.push(`/crm/quotations/${data.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const toContract = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/convert-to-contract`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setMsg(`Contract "${data.title}" created — the chain continues in Contracts.`);
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  // ── Header ────────────────────────────────────────────────────────────────────
  const meta: MetaItem[] = [
    { value: q.accountId ? <a href={`/crm/accounts/${q.accountId}`} style={st.link}>{q.customerName}</a> : q.customerName },
    ...(q.contactName ? [{ label: 'Contact', value: q.contactName }] : []),
    { label: 'Rev', value: String(q.revision) },
    { label: 'Issued', value: q.issueDate },
    ...(q.sourceOpportunityId ? [{ label: 'Source', value: <a href={`/crm/opportunities/${q.sourceOpportunityId}`} style={st.link}>Opportunity</a> }] : []),
    ...(q.sourceTenderId ? [{ label: 'Source', value: <a href={`/tendering/tenders/${q.sourceTenderId}/pricing`} style={st.link}>Tender pricing</a> }] : []),
    ...(q.convertedContractId ? [{ value: <a href={`/contracts/contracts/${q.convertedContractId}`} style={st.link}>Awarded → Contract</a> }] : []),
  ];

  const actions = (
    <>
      {q.status === 'draft' && (
        <>
          <ActionButton kind="ghost" disabled={busy} onClick={() => act('submit_review')}>Review →</ActionButton>
          <ActionButton kind="primary" disabled={busy} onClick={() => act('approve')}>Approve ✓</ActionButton>
        </>
      )}
      {q.status === 'internal_review' && <ActionButton kind="primary" disabled={busy} onClick={() => act('approve')}>Approve ✓</ActionButton>}
      {q.status === 'approved' && <ActionButton kind="primary" disabled={busy} onClick={() => act('send')}>Send</ActionButton>}
      {q.status === 'sent' && <ActionButton kind="ghost" disabled={busy} onClick={() => act('negotiate')}>Negotiate</ActionButton>}
      {(q.status === 'sent' || q.status === 'under_negotiation') && (
        <>
          <ActionButton kind="ghost" disabled={busy} onClick={() => act('accept')}>Accept ✓</ActionButton>
          <ActionButton kind="ghost" disabled={busy} onClick={() => act('reject')}>Reject ✕</ActionButton>
        </>
      )}
      {['sent', 'under_negotiation', 'rejected', 'expired'].includes(q.status) && (
        <ActionButton kind="ghost" disabled={busy} onClick={() => void revise()}>Revise ↺</ActionButton>
      )}
      {q.status === 'accepted' && !q.convertedContractId && (
        <ActionButton kind="primary" disabled={busy} onClick={() => void toContract()}>→ Contract</ActionButton>
      )}
      <ActionButton kind="ghost" href={`/crm/quotations/${q.id}/print`}>⭳ Export PDF</ActionButton>
      <ActionButton kind="ghost" href={`/crm/quotations/${q.id}/pricing`}>⊞ Pricing sheet</ActionButton>
      {isOpen && <ActionButton kind="ghost" disabled={busy} onClick={() => act('cancel')}>Cancel</ActionButton>}
    </>
  );

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const kpis: KpiItem[] = [
    { label: 'Total (incl. VAT)', value: aed0(q.total), tone: 'accent' },
    { label: 'Subtotal', value: aed0(q.subtotal) },
    { label: 'VAT', value: aed0(q.vatTotal) },
    {
      label: 'Margin', tone: pricing ? (pricing.marginPct >= 20 ? 'good' : pricing.marginPct >= 10 ? 'warn' : 'bad') : 'neutral',
      value: pricing ? pct(pricing.marginPct) : '—', hint: pricing ? `${aed0(pricing.totalMargin)} over cost ${aed0(pricing.totalCost)}` : 'No pricing sheet',
    },
    { label: 'Lines', value: q.lines.length },
    {
      label: 'Valid until', value: q.validUntil ?? '—',
      tone: pastValidity ? 'bad' : expiresSoon ? 'warn' : 'neutral',
    },
    { label: 'Revisions', value: revisions.length || 1 },
  ];

  // ── Insights rail ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];
  if (q.status === 'draft' || q.status === 'internal_review') {
    insights.push({ tone: 'accent', title: 'Approval required before sending', detail: 'Send is gated on approved — approving locks the commercial baseline.', action: { label: 'Approve now', onClick: () => void act('approve') } });
  }
  if (q.status === 'approved') {
    insights.push({ tone: 'good', title: 'Ready to send', detail: 'Baseline is locked — send the quote to the customer.', action: { label: 'Send', onClick: () => void act('send') } });
  }
  if (pastValidity) {
    insights.push({ tone: 'bad', title: 'Validity has lapsed', detail: `Valid until ${q.validUntil} — revise or re-confirm with the customer.` });
  } else if (expiresSoon) {
    insights.push({ tone: 'warn', title: 'Expiring within 7 days', detail: `Valid until ${q.validUntil} — chase a decision now.` });
  }
  if (!pricing && isOpen) {
    insights.push({ tone: 'warn', title: 'No pricing sheet linked', detail: 'Margin is unknown — build the cost breakdown before negotiating.', action: { label: 'Open pricing sheet', href: `/crm/quotations/${q.id}/pricing` } });
  }
  if (pricing && pricing.marginPct < 10 && isOpen) {
    insights.push({ tone: 'bad', title: `Thin margin — ${pct(pricing.marginPct)}`, detail: 'Below the 10% floor. Review costs or price before it goes further.' });
  }
  if (q.status === 'accepted' && !q.convertedContractId) {
    insights.push({ tone: 'good', title: 'Accepted — convert to contract', detail: 'Close the loop: award this quote into a contract.', action: { label: 'Convert', onClick: () => void toContract() } });
  }
  if (q.status === 'rejected' || q.status === 'expired') {
    insights.push({ tone: 'warn', title: 'Not dead yet — revise', detail: `Supersede Rev ${q.revision} and draft Rev ${q.revision + 1} with updated commercials.`, action: { label: 'Revise ↺', onClick: () => void revise() } });
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'pricing', label: 'Pricing & margin' },
    { id: 'revisions', label: 'Revisions', count: revisions.length > 1 ? revisions.length : undefined },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <RecordShell
      header={
        <RecordHeader
          title={q.quoteNumber}
          status={STATUS_LABEL[q.status] ?? q.status.replace('_', ' ')}
          statusTone={statusTone(q.status)}
          meta={meta}
          score={{
            value: aed0(q.total).replace('AED ', ''), label: 'AED total',
            badge: pricing ? `${pct(pricing.marginPct)} margin` : undefined,
            badgeTone: pricing ? (pricing.marginPct >= 20 ? 'good' : pricing.marginPct >= 10 ? 'warn' : 'bad') : undefined,
          }}
          actions={actions}
        />
      }
      kpis={kpis}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      aside={<InsightsPanel insights={insights} />}
      footer={<RecordCard title="Timeline"><Timeline recordId={q.id} /></RecordCard>}
    >
      {(err || msg) && (
        <div style={{ ...st.flash, borderColor: err ? 'var(--bad)' : 'var(--good)', color: err ? 'var(--bad)' : 'var(--good)' }}>
          {err ?? msg}
        </div>
      )}

      {tab === 'overview' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <RecordCard title="Line items">
            <div style={{ overflowX: 'auto' }}>
              <table style={st.table}>
                <thead><tr>{['Description', 'Qty', 'Unit price', 'VAT %', 'Net'].map((h, i) => (
                  <th key={h} style={{ ...st.th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {q.lines.map((l, i) => (
                    <tr key={i}>
                      <td style={st.td}>{l.description}</td>
                      <td style={st.tdR}>{l.quantity}</td>
                      <td style={st.tdR}>{money(l.unitPrice)}</td>
                      <td style={st.tdR}>{l.vatRate}%</td>
                      <td style={st.tdR}>{money(l.lineNet)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4} style={st.tfLabel}>Subtotal</td><td style={st.tdR}>{money(q.subtotal)}</td></tr>
                  <tr><td colSpan={4} style={st.tfLabel}>VAT</td><td style={st.tdR}>{money(q.vatTotal)}</td></tr>
                  <tr><td colSpan={4} style={{ ...st.tfLabel, fontWeight: 800 }}>Total</td><td style={{ ...st.tdR, fontWeight: 800 }}>{money(q.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </RecordCard>
          <CardGrid>
            <RecordCard title="Document">
              <InfoRow label="Customer" value={q.accountId ? <a href={`/crm/accounts/${q.accountId}`} style={st.link}>{q.customerName}</a> : q.customerName} />
              <InfoRow label="Contact" value={q.contactName ?? '—'} />
              <InfoRow label="Owner" value={q.ownerId ?? '—'} />
              <InfoRow label="Issue date" value={q.issueDate} />
              <InfoRow label="Valid until" value={q.validUntil ?? '—'} />
            </RecordCard>
            <RecordCard title="Commercial terms">
              {q.terms ? <p style={st.terms}>{q.terms}</p> : <p style={st.empty}>No terms captured on this revision.</p>}
            </RecordCard>
          </CardGrid>
        </div>
      )}

      {tab === 'pricing' && (
        pricing ? (
          <RecordCard title="Cost & margin per line" action={<ActionButton kind="ghost" href={`/crm/quotations/${q.id}/pricing`}>Open full sheet ⊞</ActionButton>}>
            <div style={{ overflowX: 'auto' }}>
              <table style={st.table}>
                <thead><tr>{['Description', 'Qty', 'Unit cost', 'Unit price', 'Net', 'Margin', 'Margin %'].map((h, i) => (
                  <th key={h} style={{ ...st.th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {pricing.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={st.td}>{r.description}</td>
                      <td style={st.tdR}>{r.quantity}</td>
                      <td style={st.tdR}>{money(r.unitCost)}</td>
                      <td style={st.tdR}>{money(r.unitPrice)}</td>
                      <td style={st.tdR}>{money(r.lineNet)}</td>
                      <td style={{ ...st.tdR, color: r.margin >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(r.margin)}</td>
                      <td style={{ ...st.tdR, color: r.marginPct >= 20 ? 'var(--good)' : r.marginPct >= 10 ? 'var(--warn, #d97706)' : 'var(--bad)' }}>{pct(r.marginPct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={st.tfLabel}>Totals</td>
                    <td style={st.tdR}>{money(q.subtotal)}</td>
                    <td style={{ ...st.tdR, fontWeight: 800 }}>{money(pricing.totalMargin)}</td>
                    <td style={{ ...st.tdR, fontWeight: 800 }}>{pct(pricing.marginPct)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </RecordCard>
        ) : (
          <RecordCard title="Pricing & margin">
            <p style={st.empty}>No pricing sheet is linked to this quotation — margin cannot be computed.</p>
            <ActionButton kind="primary" href={`/crm/quotations/${q.id}/pricing`}>Build the pricing sheet ⊞</ActionButton>
          </RecordCard>
        )
      )}

      {tab === 'revisions' && (
        <RecordCard title="Revision history">
          {revisions.length <= 1 ? (
            <p style={st.empty}>Single revision — this document has never been superseded.</p>
          ) : (
            <div style={st.revChain}>
              {revisions.map((r) => (
                <a key={r.id} href={`/crm/quotations/${r.id}`}
                  style={{ ...st.revChip, ...(r.id === q.id ? st.revChipActive : {}), color: r.id === q.id ? 'var(--accent)' : 'var(--fg)' }}>
                  <b>Rev {r.revision}</b>
                  <span style={st.revChipMeta}>{(STATUS_LABEL[r.status] ?? r.status).toLowerCase()} · {aed0(r.total)}</span>
                </a>
              ))}
            </div>
          )}
        </RecordCard>
      )}

      {tab === 'activity' && (
        <RecordCard title="Activity"><Timeline recordId={q.id} /></RecordCard>
      )}
    </RecordShell>
  );
}

const st: Record<string, CSSProperties> = {
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 },
  flash: { borderWidth: 1, borderStyle: 'solid', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '7px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border)' },
  tdR: { padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  tfLabel: { padding: '8px', textAlign: 'right', color: 'var(--muted)' },
  terms: { fontSize: 13, color: 'var(--fg)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 },
  empty: { fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' },
  revChain: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  revChip: { display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px', textDecoration: 'none', minWidth: 92 },
  revChipActive: { borderColor: 'var(--accent)', background: 'var(--panel-2, var(--panel))' },
  revChipMeta: { fontSize: 11, color: 'var(--muted)' },
};
