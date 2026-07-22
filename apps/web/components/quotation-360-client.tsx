'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Timeline from './timeline';
import {
  RecordShell, RecordHeader, ActionButton, RecordCard, InfoRow, CardGrid, InsightsPanel,
  RecordBand, RecordSituation, RecordNextAction, RecordHealth, RecordMissing, RecordOutcome,
  useTab, type Tone, type KpiItem, type Insight, type TabDef, type MetaItem,
  type HealthState, type NextBestAction,
} from './crm/record-shell';

// Quotation 360 — the commercial document command center on the shared CRM
// record-shell: Header + lifecycle Actions, KPIs (value/margin/validity), fixed
// Tabs (Overview / Pricing / Revisions / Activity), Insights rail, Timeline foot.

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
export interface Quotation {
  id: string; quoteNumber: string; customerName: string; accountId: string | null; contactName: string | null;
  ownerId: string | null; terms: string | null; revision: number; status: string;
  exclusions?: string[]; paymentConditions?: string | null; deliveryTerms?: string | null;
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
  // Outcome Loop — capture what happened after acting so no quote stalls unseen.
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);

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

  // ── Universal Object Shell — Situation / Business Health / Missing Info / Next Best Action ──
  const WAITING: Record<string, string> = {
    draft: 'needs approval', internal_review: 'in review', approved: 'ready to send',
    sent: 'awaiting customer decision', under_negotiation: 'in negotiation',
    accepted: q.convertedContractId ? 'awarded to contract' : 'ready to convert',
    rejected: 'declined by customer', expired: 'validity lapsed', cancelled: 'cancelled',
  };
  const situationText = `${STATUS_LABEL[q.status] ?? q.status} · Rev ${q.revision} · ${aed0(q.total)}${WAITING[q.status] ? ` · ${WAITING[q.status]}` : ''}`;

  let bandHealth: HealthState;
  if (q.status === 'accepted') bandHealth = { label: q.convertedContractId ? 'Awarded' : 'Accepted', tone: 'good' };
  else if (q.status === 'rejected' || q.status === 'cancelled') bandHealth = { label: STATUS_LABEL[q.status], tone: 'bad' };
  else if (pastValidity) bandHealth = { label: 'Validity lapsed', tone: 'bad', reasons: [`valid until ${q.validUntil}`] };
  else if (pricing && pricing.marginPct < 10 && isOpen) bandHealth = { label: 'Thin margin', tone: 'bad', reasons: [`${pct(pricing.marginPct)} — below the 10% floor`] };
  else if (expiresSoon) bandHealth = { label: 'Expiring soon', tone: 'warn', reasons: [`valid until ${q.validUntil}`] };
  else if (q.status === 'expired') bandHealth = { label: 'Expired', tone: 'warn' };
  else if (q.status === 'draft' || q.status === 'internal_review') bandHealth = { label: 'Awaiting approval', tone: 'warn' };
  else if (!pricing && isOpen) bandHealth = { label: 'No margin visibility', tone: 'warn', reasons: ['no pricing sheet linked'] };
  else bandHealth = { label: 'On track', tone: 'good' };

  // Missing Information — what's blocking this quote from progressing.
  const missing: string[] = [];
  if (isOpen) {
    if (q.status === 'draft' || q.status === 'internal_review') missing.push('Approval');
    if (!pricing) missing.push('Pricing sheet');
    if (!q.validUntil) missing.push('Validity date');
    if (!q.contactName) missing.push('Customer contact');
    // A quote with no payment terms, no delivery terms, no exclusions AND no notes has no
    // commercial position stated — the free-text blob is no longer the only place they can live.
    const hasTerms = !!q.terms || !!q.paymentConditions || !!q.deliveryTerms || (q.exclusions?.length ?? 0) > 0;
    if (!hasTerms) missing.push('Commercial terms');
  }

  // The ONE next best action — mapped to the lifecycle.
  let nba: NextBestAction | undefined;
  if (q.status === 'accepted' && !q.convertedContractId) nba = { label: '→ Convert to contract', hint: 'award the quote', onClick: () => void toContract() };
  else if (q.status === 'draft' || q.status === 'internal_review') nba = { label: 'Approve', hint: 'locks the commercial baseline', onClick: () => void act('approve') };
  else if (q.status === 'approved') nba = { label: 'Send to customer', onClick: () => void act('send') };
  else if (pastValidity || q.status === 'rejected' || q.status === 'expired') nba = { label: 'Revise ↺', hint: `supersede Rev ${q.revision}`, onClick: () => void revise() };
  else if (q.status === 'sent' || q.status === 'under_negotiation') nba = { label: 'Chase a decision', hint: 'awaiting customer', onClick: () => setTab('activity') };
  else if (!pricing && isOpen) nba = { label: 'Build the pricing sheet', href: `/crm/quotations/${q.id}/pricing` };

  // Outcome Loop — writes a real activity linked to this quotation (§17 activity stream).
  const logOutcome = async (choiceId: string): Promise<void> => {
    const ref = q.quoteNumber;
    const plan: Record<string, { type: string; subject: string; status?: string }> = {
      completed: { type: 'note', subject: `Outcome — ${ref}: customer responded`, status: 'completed' },
      failed: { type: 'note', subject: `Outcome — ${ref}: no response`, status: 'completed' },
      follow_up: { type: 'follow_up', subject: `Follow up: ${ref} (${q.customerName})` },
      reschedule: { type: 'task', subject: `Reschedule: ${ref}` },
    };
    const a2 = plan[choiceId];
    if (!a2) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: a2.type, subject: a2.subject, relatedType: 'quotation', relatedId: q.id, relatedName: q.quoteNumber, status: a2.status }),
      });
      if (!res.ok) { setErr('Could not log the outcome'); return; }
      setOutcomeNote(`Logged: ${a2.subject}`);
      router.refresh();
    } finally { setBusy(false); }
  };

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
      situation={
        <RecordBand tone={bandHealth?.tone}>
          <RecordSituation situation={situationText} />
          {nba && <RecordNextAction action={nba} />}
          {bandHealth && <RecordHealth health={bandHealth} />}
          <RecordMissing items={missing} />
          {isOpen && <RecordOutcome outcome={{ onSelect: logOutcome, busy, note: outcomeNote }} />}
        </RecordBand>
      }
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
              <CommercialTerms q={q} editable={q.status === 'draft' || q.status === 'internal_review'} onSaved={() => router.refresh()} />
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

/**
 * Commercial terms — structured, and editable while the quote is still being worked up.
 *
 * Exclusions are a list because "does this cover the permits?" should be answered by a row, not
 * by re-reading a paragraph. Editing is offered only on draft / internal-review: after that the
 * customer and the locked baseline hold these terms, so the API refuses (409) and the UI does not
 * pretend otherwise — it shows them read-only with a note that a revision is the way to change them.
 */
function CommercialTerms({ q, editable, onSaved }: { q: Quotation; editable: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [exclusions, setExclusions] = useState((q.exclusions ?? []).join('\n'));
  const [payment, setPayment] = useState(q.paymentConditions ?? '');
  const [delivery, setDelivery] = useState(q.deliveryTerms ?? '');
  const [notes, setNotes] = useState(q.terms ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = q.exclusions ?? [];
  const anything = !!q.terms || !!q.paymentConditions || !!q.deliveryTerms || list.length > 0;

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/terms`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          exclusions: exclusions.split('\n').map((s) => s.trim()).filter(Boolean),
          paymentConditions: payment.trim() || null,
          deliveryTerms: delivery.trim() || null,
          terms: notes.trim() || null,
        }),
      });
      if (res.status === 409) { setErr('This quote is past draft — raise a revision to change its terms.'); return; }
      if (!res.ok) { setErr('Could not save the terms.'); return; }
      setEditing(false);
      onSaved();
    } catch {
      setErr('Could not reach the server — nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div style={st.termsEdit}>
        <label style={st.termsLabel}>Exclusions — one per line
          <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={4} style={st.termsArea}
            placeholder={'VAT\nPermits & approvals\nCivil works'} />
        </label>
        <label style={st.termsLabel}>Payment conditions
          <input value={payment} onChange={(e) => setPayment(e.target.value)} style={st.termsInput} placeholder="50% advance, 50% on delivery" />
        </label>
        <label style={st.termsLabel}>Delivery terms
          <input value={delivery} onChange={(e) => setDelivery(e.target.value)} style={st.termsInput} placeholder="6–8 weeks from PO" />
        </label>
        <label style={st.termsLabel}>Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={st.termsArea} placeholder="Anything the fields above don't capture" />
        </label>
        {err && <p style={st.termsErr}>{err}</p>}
        <div style={st.termsBtns}>
          <ActionButton kind="primary" onClick={() => void save()}>{busy ? 'Saving…' : 'Save terms'}</ActionButton>
          <ActionButton kind="ghost" onClick={() => setEditing(false)}>Cancel</ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!anything && <p style={st.empty}>No commercial terms captured on this revision.</p>}
      {list.length > 0 && (
        <div style={st.termsBlock}>
          <span style={st.termsHead}>Excludes</span>
          <ul style={st.exclList}>{list.map((x, i) => <li key={i} style={st.exclItem}>{x}</li>)}</ul>
        </div>
      )}
      {q.paymentConditions && <InfoRow label="Payment" value={q.paymentConditions} />}
      {q.deliveryTerms && <InfoRow label="Delivery" value={q.deliveryTerms} />}
      {q.terms && <p style={st.terms}>{q.terms}</p>}
      {editable && (
        <div style={{ marginTop: 10 }}>
          <ActionButton kind="ghost" onClick={() => setEditing(true)}>{anything ? 'Edit terms' : 'Add terms'}</ActionButton>
        </div>
      )}
      {!editable && anything && <p style={st.termsNote}>Locked past draft — revise the quote to change these.</p>}
    </div>
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
  terms: { fontSize: 13, color: 'var(--fg)', margin: '8px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.55 },
  empty: { fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' },
  termsBlock: { marginBottom: 8 },
  termsHead: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' },
  exclList: { margin: '4px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 },
  exclItem: { fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 },
  termsNote: { fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.5 },
  termsEdit: { display: 'flex', flexDirection: 'column', gap: 10 },
  termsLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--muted)' },
  termsArea: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--fg)', padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' },
  termsInput: { background: 'var(--panel-2, var(--panel))', border: '1px solid var(--border-strong, var(--border))', borderRadius: 7, color: 'var(--fg)', padding: '7px 9px', fontSize: 12.5 },
  termsErr: { color: 'var(--bad)', fontSize: 12, margin: 0 },
  termsBtns: { display: 'flex', gap: 8 },
  revChain: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  revChip: { display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px', textDecoration: 'none', minWidth: 92 },
  revChipActive: { borderColor: 'var(--accent)', background: 'var(--panel-2, var(--panel))' },
  revChipMeta: { fontSize: 11, color: 'var(--muted)' },
};
