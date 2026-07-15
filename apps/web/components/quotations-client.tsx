'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportButton from './export-button';
import { EntityForm } from './form-engine';

// CRM · Quotations — a real deal-chain member, not a proto-invoice. Lifecycle:
//   Draft → Internal Review → Approved → Sent → Under Negotiation →
//   Accepted / Rejected / Expired / Cancelled  (+ Revised when superseded)
// Each quotation carries its provenance (Account → Opportunity → [Tender] →
// Quotation → Contract) and revisions (Rev 0 → 1 → 2 …). Accepted quotes
// convert to a contract in one click.

interface Line { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }
interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  accountId: string | null;
  sourceTenderId?: string | null;
  sourceOpportunityId?: string | null;
  convertedContractId?: string | null;
  ownerId?: string | null;
  terms?: string | null;
  revision?: number;
  parentQuotationId?: string | null;
  issueDate: string;
  validUntil: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  lines: Line[];
}

const badgeKind: Record<string, string> = {
  draft: 'badge',
  internal_review: 'badge badge-warn',
  approved: 'badge badge-accent',
  sent: 'badge badge-accent',
  under_negotiation: 'badge badge-warn',
  revised: 'badge',
  accepted: 'badge badge-good',
  rejected: 'badge badge-bad',
  expired: 'badge badge-warn',
  cancelled: 'badge badge-bad',
};

const OPEN_STATUSES = ['draft', 'internal_review', 'approved', 'sent', 'under_negotiation'];
const LOST_STATUSES = ['rejected', 'expired', 'cancelled'];
const aed = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function QuotationsClient({ initialQuotations }: { initialQuotations: Quotation[] }) {
  const router = useRouter();
  const quotes = initialQuotations;
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [openTerms, setOpenTerms] = useState<string | null>(null);

  const kpi = useMemo(() => {
    const sum = (list: Quotation[]) => list.reduce((s, q) => s + q.total, 0);
    const draft = quotes.filter((q) => ['draft', 'internal_review', 'approved'].includes(q.status));
    const open = quotes.filter((q) => ['sent', 'under_negotiation'].includes(q.status));
    const accepted = quotes.filter((q) => q.status === 'accepted');
    const lost = quotes.filter((q) => LOST_STATUSES.includes(q.status));
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const expiring = quotes.filter((q) => OPEN_STATUSES.includes(q.status) && q.validUntil && q.validUntil >= today && q.validUntil <= soon);
    const decided = accepted.length + lost.length;
    return {
      draftValue: sum(draft),
      openValue: sum(open),
      acceptedValue: sum(accepted),
      lostValue: sum(lost),
      expiringSoon: expiring.length,
      acceptanceRate: decided > 0 ? Math.round((accepted.length / decided) * 100) : null,
    };
  }, [quotes]);

  const act = async (id: string, action: string) => {
    setError(''); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  };

  const revise = async (q: Quotation) => {
    setError(''); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/revise`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setMsg(`${q.quoteNumber} Rev ${q.revision ?? 0} superseded — Rev ${data.revision} drafted, edit and re-send.`);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  };

  const convertToContract = async (q: Quotation) => {
    setError(''); setMsg('');
    try {
      const res = await fetch(`/api/crm/quotations/${q.id}/convert-to-contract`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setMsg(`Contract "${data.title}" created from ${q.quoteNumber} — the chain continues in Contracts.`);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      {/* KPI strip */}
      <div style={st.cards}>
        <Kpi label="Draft value" value={`AED ${aed(kpi.draftValue)}`} />
        <Kpi label="Open / sent value" value={`AED ${aed(kpi.openValue)}`} accent />
        <Kpi label="Accepted value" value={`AED ${aed(kpi.acceptedValue)}`} good />
        <Kpi label="Rejected / lost value" value={`AED ${aed(kpi.lostValue)}`} bad />
        <Kpi label="Expiring ≤ 7 days" value={String(kpi.expiringSoon)} bad={kpi.expiringSoon > 0} />
        <Kpi label="Acceptance rate" value={kpi.acceptanceRate === null ? '—' : `${kpi.acceptanceRate}%`} accent />
      </div>

      <div style={st.toolbar}>
        <EntityForm id="crm.quotation" />
        <ExportButton filename="quotations" rows={quotes as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'quoteNumber' }, { key: 'revision' }, { key: 'customerName' }, { key: 'issueDate' }, { key: 'validUntil' }, { key: 'subtotal' }, { key: 'vatTotal' }, { key: 'total' }, { key: 'status' }, { key: 'ownerId' }]} />
        {error && <span style={st.err}>{error}</span>}
        {msg && <span style={st.ok}>{msg}</span>}
      </div>

      {quotes.length === 0 ? (
        <p style={st.muted}>No quotations yet — create the first one.</p>
      ) : (
        <section className="panel">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 1080 }}>
              <thead><tr>
                <th>Date</th><th>Quote #</th><th>Account</th><th>Source</th>
                <th>Net</th><th>VAT</th><th>Total</th><th>Valid until</th><th>Status</th><th>Owner</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {quotes.map((q) => {
                  const rev = q.revision ?? 0;
                  const expiring = OPEN_STATUSES.includes(q.status) && q.validUntil && q.validUntil <= soon && q.validUntil >= today;
                  const expiredDate = OPEN_STATUSES.includes(q.status) && q.validUntil && q.validUntil < today;
                  return (
                    <tr key={q.id} style={q.status === 'revised' ? { opacity: 0.55 } : undefined}>
                      <td style={{ color: 'var(--muted)' }}>{q.issueDate}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <a href={`/crm/quotations/${q.id}`} style={st.link}>{q.quoteNumber}</a>
                        {rev > 0 && <span style={st.revTag}>Rev {rev}</span>}
                        {q.terms && (
                          <button type="button" style={st.termsBtn} title="Commercial terms" onClick={() => setOpenTerms(openTerms === q.id ? null : q.id)}>§</button>
                        )}
                        {openTerms === q.id && <div style={st.termsBox}>{q.terms}</div>}
                      </td>
                      <td>
                        {q.accountId
                          ? <a href={`/crm/accounts/${q.accountId}`} style={st.link}>{q.customerName}</a>
                          : q.customerName}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {q.sourceOpportunityId && <span style={st.srcChip} title="Converted from a won opportunity (direct-sale path)">◎ Opportunity</span>}
                        {q.sourceTenderId && <a href={`/tendering/tenders/${q.sourceTenderId}/pricing`} style={{ ...st.srcChip, ...st.link }} title="Generated from the tender pricing sheet">◳ Tender</a>}
                        {q.convertedContractId && <a href={`/contracts/contracts/${q.convertedContractId}`} style={{ ...st.srcChip, color: 'var(--good)' }} title="Contract created from this quotation">▤ Contract</a>}
                        {!q.sourceOpportunityId && !q.sourceTenderId && !q.convertedContractId && <span style={{ color: 'var(--muted)' }}>direct</span>}
                      </td>
                      <td>{aed(q.subtotal)}</td>
                      <td style={{ color: 'var(--muted)' }}>{aed(q.vatTotal)}</td>
                      <td style={{ fontWeight: 600 }}>{aed(q.total)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: expiredDate ? 'var(--bad)' : expiring ? 'var(--warn, #d97706)' : 'var(--muted)' }}>
                        {q.validUntil ?? '—'}{expiring ? ' ⚠' : ''}{expiredDate ? ' ✗' : ''}
                      </td>
                      <td><span className={badgeKind[q.status] ?? 'badge'}>{q.status.replace(/_/g, ' ')}</span></td>
                      <td style={{ color: 'var(--muted)' }}>{q.ownerId ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {q.status === 'draft' && (
                            <>
                              <button type="button" className="btn" style={st.smBtn} onClick={() => act(q.id, 'submit_review')}>Review →</button>
                              <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(q.id, 'send')}>Send</button>
                            </>
                          )}
                          {q.status === 'internal_review' && <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(q.id, 'approve')}>Approve ✓</button>}
                          {q.status === 'approved' && <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(q.id, 'send')}>Send</button>}
                          {q.status === 'sent' && <button type="button" className="btn" style={st.smBtn} onClick={() => act(q.id, 'negotiate')}>Negotiate</button>}
                          {(q.status === 'sent' || q.status === 'under_negotiation') && (
                            <>
                              <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} onClick={() => act(q.id, 'accept')}>Accept</button>
                              <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--bad)' }} onClick={() => act(q.id, 'reject')}>Reject</button>
                            </>
                          )}
                          {['sent', 'under_negotiation', 'rejected', 'expired'].includes(q.status) && (
                            <button type="button" className="btn" style={st.smBtn} title="Supersede and draft Rev n+1" onClick={() => revise(q)}>Revise ↺</button>
                          )}
                          {q.status === 'accepted' && !q.convertedContractId && (
                            <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => convertToContract(q)}>→ Contract</button>
                          )}
                          {OPEN_STATUSES.includes(q.status) && (
                            <button type="button" className="btn btn-ghost" style={st.smBtn} onClick={() => act(q.id, 'cancel')}>Cancel</button>
                          )}
                          <a className="btn btn-ghost" style={st.smBtn} href={`/crm/quotations/${q.id}/pricing`} title="Internal pricing sheet">⊞</a>
                          <a className="btn btn-ghost" style={st.smBtn} href={`/crm/quotations/${q.id}/print`} title="Export PDF">🖨</a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Kpi({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{label}</div>
      <div style={{ ...st.cardVal, ...(accent ? { color: 'var(--accent)' } : {}), ...(good ? { color: 'var(--good)' } : {}), ...(bad ? { color: 'var(--bad)' } : {}) }}>{value}</div>
    </div>
  );
}

const st = {
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 } as CSSProperties,
  card: { padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' } as CSSProperties,
  cardLabel: { fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 18, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } as CSSProperties,
  smBtn: { padding: '5px 10px', fontSize: 12 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  ok: { color: 'var(--good)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  revTag: { marginLeft: 6, fontSize: 10, fontWeight: 800, border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 999, padding: '1px 6px', verticalAlign: 'middle' } as CSSProperties,
  srcChip: { display: 'inline-block', marginRight: 6, fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '2px 8px', color: 'var(--muted)', textDecoration: 'none' } as CSSProperties,
  termsBtn: { marginLeft: 6, background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', fontSize: 10.5, cursor: 'pointer', padding: '0 5px' } as CSSProperties,
  termsBox: { marginTop: 4, fontSize: 11.5, color: 'var(--muted)', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 9px', maxWidth: 280, whiteSpace: 'normal', fontWeight: 400 } as CSSProperties,
};
