'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * SUP-13 and SUP-14 on screen — the sourcing decision, and the award it produces.
 *
 * AURA ASSEMBLES; A PERSON DECIDES. Everything in the candidates table comes from one governed API
 * result. The screen computes no money of its own — no totals, no conversions, no "cheapest" — and
 * it does not sort by price, because an ordering is a recommendation under another name. What it
 * adds is the ability to record a decision: who is chosen for which requisition lines, and why.
 *
 * THE AWARD IS IN THE SUPPLIER'S CURRENCY. The comparison column exists so offers can be weighed
 * against each other; the purchase order it produces is in the currency the supplier quoted, at the
 * prices they quoted. The screen says so where the award appears, because a buyer who sees AED
 * everywhere while comparing needs to know the order that went out was USD.
 */

interface WholeOfferTotal {
  status: 'known' | 'unknown';
  value?: number;
  currency?: string;
  comparisonDate?: string;
  includesFreight?: boolean;
  reason?: string;
  detail?: string;
}

interface Candidate {
  familyId: string;
  offerId: string;
  offerKind: 'base' | 'alternative';
  offerLabel: string | null;
  supplierName: string;
  revisionId: string | null;
  revisionNo: number | null;
  supplierQuotationRef: string | null;
  currency: string | null;
  paymentTerms: string | null;
  freightTerms: string | null;
  validityDate: string | null;
  commercialStatus: 'live' | 'expired' | 'validity_unknown';
  pricedPrLineIds: string[];
  wholeOfferTotal: WholeOfferTotal;
  technicalByLine: Record<string, 'eligible' | 'not_eligible' | 'unknown'>;
  recommendability: { recommendable: boolean; reasons: Array<{ reason: string; detail: string }> };
}

interface Requirement {
  prLineId: string;
  materialCode: string | null;
  materialName: string | null;
  quantity: number | null;
  uom: string | null;
}

interface Assembled {
  rfqId: string;
  context: { baseCurrency: string; comparisonDate: string };
  requirements: Requirement[];
  candidates: Candidate[];
}

interface Selection {
  id: string;
  offerId: string;
  supplierName: string;
  revisionId: string;
  coveredPrLineIds: string[];
  governedTotal: number | null;
  governedTotalBasis: string | null;
  commercialStatus: string;
}

interface Recommendation {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'returned' | 'awarded' | 'withdrawn';
  mode: 'single_supplier' | 'split_award';
  comparisonDate: string;
  comparisonCurrency: string;
  reasonCode: string | null;
  reason: string | null;
  submittedBy: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

interface Live {
  recommendation: Recommendation;
  selections: Selection[];
  staleness: { stale: boolean; affected: Array<{ supplierName: string; detail: string }> };
}

interface AwardedOrder {
  id: string;
  reference: string | null;
  supplierName: string | null;
  value: number;
  currency: string | null;
  freightAmount: number | null;
  paymentTerms: string | null;
}

const REASON_CODES = [
  ['single_source_coordination', 'Single source for coordination'],
  ['better_delivery', 'Better delivery'],
  ['better_warranty', 'Better warranty'],
  ['lower_project_risk', 'Lower project risk'],
  ['technical_preference', 'Technical preference'],
  ['commercial_clarification', 'Commercial clarification'],
  ['other', 'Other'],
] as const;

function amount(n: number, currency: string | null): string {
  const value = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${value} ${currency}` : value;
}

export default function SourcingDecisionClient({ rfqId }: { rfqId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [comparisonDate, setComparisonDate] = useState(today);
  const [data, setData] = useState<Assembled | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [orders, setOrders] = useState<AwardedOrder[] | null>(null);
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Every call reports the API's own sentence. A refusal a buyer cannot read is a dead end. */
  const call = useCallback(async (path: string, init?: RequestInit): Promise<unknown | null> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/procurement/sourcing/${path}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.message ?? body.error ?? `Error ${res.status}`); return null; }
      return body;
    } catch { setErr('Procurement API unreachable'); return null; } finally { setBusy(false); }
  }, []);

  const loadLive = useCallback(async () => {
    const list = await call(`${rfqId}/recommendations`);
    // Only a LIVE one occupies the RFQ. Rejected and withdrawn ones are closed history.
    const open = (list as Recommendation[] | null)
      ?.find((r) => ['draft', 'submitted', 'approved', 'returned', 'awarded'].includes(r.status)) ?? null;
    if (!open) { setLive(null); return; }
    const full = await call(`recommendations/${open.id}`);
    setLive((full as Live) ?? null);
  }, [call, rfqId]);

  const loadCandidates = useCallback(async (date: string) => {
    const body = await call(`${rfqId}/recommendation/candidates?comparisonDate=${date}`);
    setData((body as Assembled) ?? null);
  }, [call, rfqId]);

  useEffect(() => { void loadCandidates(comparisonDate); }, [loadCandidates, comparisonDate]);
  useEffect(() => { void loadLive(); }, [loadLive]);

  if (err && !data) return <div style={s.error} data-testid="sourcing-error">{err}</div>;
  if (!data) return <div style={s.muted}>Loading offers…</div>;

  const chosenOfferIds = [...new Set(Object.values(assignment).filter(Boolean))];
  const mode: Recommendation['mode'] = chosenOfferIds.length > 1 ? 'split_award' : 'single_supplier';
  const everyLineAssigned = data.requirements.every((r) => assignment[r.prLineId]);

  async function prepare(): Promise<void> {
    const selections = chosenOfferIds.map((offerId) => ({
      offerId,
      coveredPrLineIds: data!.requirements.filter((r) => assignment[r.prLineId] === offerId).map((r) => r.prLineId),
    }));
    const body = await call(`${rfqId}/recommendation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode, comparisonDate: data!.context.comparisonDate,
        reasonCode: reasonCode || null, reason: reason.trim() || null, selections,
      }),
    });
    if (body) { setReason(''); setReasonCode(''); await loadLive(); }
  }

  async function act(path: string, payload?: unknown): Promise<void> {
    const body = await call(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    if (!body) return;
    if (path.endsWith('/award')) {
      setOrders((body as { orders: AwardedOrder[] }).orders);
    }
    setNote('');
    await loadLive();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* THE BASIS, STATED BEFORE ANY NUMBER — and before anybody chooses on one. */}
      <div style={s.basis} data-testid="sourcing-basis">
        <div style={s.basisRow}>
          <label style={s.label} htmlFor="sourcing-date">Comparison date</label>
          <input
            id="sourcing-date" data-testid="sourcing-date" type="date" style={s.input}
            value={comparisonDate} onChange={(e) => setComparisonDate(e.target.value)}
          />
          <span style={s.muted} data-testid="sourcing-context">
            Compared in <strong>{data.context.baseCurrency}</strong> · ex-tax · freight added at the offer, never spread across lines
          </span>
        </div>
        <p style={s.note} data-testid="sourcing-no-winner">
          Nothing below is ranked and no offer is marked preferred. The comparison exists so offers
          can be weighed against each other; choosing one is a decision a person records here, and
          somebody else approves. Any purchase order it produces is placed in the supplier&rsquo;s own
          currency, at the prices they quoted.
        </p>
      </div>

      {err && <div style={s.error} data-testid="sourcing-error">{err}</div>}

      {/* ── WHAT EVERY SUPPLIER OFFERED ─────────────────────────────────────── */}
      <div className="table-scroll">
        <table className="data-table" data-testid="candidates-table">
          <thead>
            <tr>
              {['Supplier', 'Offer', `Whole offer (${data.context.baseCurrency})`, 'Supplier’s own terms', 'Validity', 'May be recommended'].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c) => (
              <tr key={c.offerId} data-testid={`candidate-${c.offerId}`}>
                <td style={s.td}><strong>{c.supplierName}</strong></td>
                <td style={s.td} data-testid={`offer-${c.offerId}`}>
                  {c.offerKind === 'alternative' ? (c.offerLabel ?? 'Alternative') : 'Base offer'}
                  {c.revisionNo !== null && <span style={s.prov}>Rev {c.revisionNo}{c.supplierQuotationRef ? ` · ${c.supplierQuotationRef}` : ''}</span>}
                  {c.revisionNo === null && <span style={s.unknown}>No confirmed revision</span>}
                </td>

                {/* The comparison figure — and the sentence when there is no figure to give. */}
                <td style={s.td} data-testid={`total-${c.offerId}`}>
                  {c.wholeOfferTotal.status === 'known' ? (
                    <>
                      <strong>{amount(c.wholeOfferTotal.value!, c.wholeOfferTotal.currency ?? null)}</strong>
                      <span style={s.prov}>
                        ex-tax, {c.wholeOfferTotal.includesFreight ? 'including' : 'excluding'} freight
                      </span>
                    </>
                  ) : (
                    <span style={s.unknown} data-testid={`total-unknown-${c.offerId}`}>
                      Not known — {c.wholeOfferTotal.detail}
                    </span>
                  )}
                </td>

                {/* What the ORDER would be placed on, kept visibly separate from the comparison. */}
                <td style={s.td} data-testid={`terms-${c.offerId}`}>
                  {c.currency ? <strong>{c.currency}</strong> : <span style={s.unknown}>No currency stated</span>}
                  {c.paymentTerms && <span style={s.prov}>{c.paymentTerms}</span>}
                  {c.freightTerms && <span style={s.prov}>{c.freightTerms}</span>}
                </td>

                <td style={s.td} data-testid={`validity-${c.offerId}`}>
                  {c.commercialStatus === 'expired' && <span style={s.expired}>Expired {c.validityDate}</span>}
                  {c.commercialStatus === 'live' && <span style={s.muted}>Valid to {c.validityDate}</span>}
                  {c.commercialStatus === 'validity_unknown' && <span style={s.unknown}>No validity date given</span>}
                </td>

                <td style={s.td} data-testid={`recommendable-${c.offerId}`}>
                  {c.recommendability.recommendable
                    ? <span style={s.ok}>Yes</span>
                    : (
                      <ul style={s.reasons}>
                        {c.recommendability.reasons.map((r) => (
                          <li key={r.reason} style={s.unknown}>{r.detail}</li>
                        ))}
                      </ul>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── RECORDING THE DECISION ──────────────────────────────────────────── */}
      {!live && (
        <div style={s.panel} data-testid="decision-form">
          <h2 style={s.h2}>Record a recommendation</h2>
          <p style={s.note}>
            Choose who supplies each requisition line. Every line must be covered exactly once — an
            uncovered line would simply vanish from the orders, and a line given to two suppliers
            would be ordered twice.
          </p>
          <table className="data-table">
            <thead>
              <tr><th style={s.th}>Requisition line</th><th style={s.th}>Supplied by</th></tr>
            </thead>
            <tbody>
              {data.requirements.map((r) => (
                <tr key={r.prLineId}>
                  <td style={s.td}>
                    {r.materialName ?? r.materialCode ?? r.prLineId}
                    <span style={s.prov}>{r.quantity ?? '—'} {r.uom ?? ''}</span>
                  </td>
                  <td style={s.td}>
                    <select
                      style={s.input}
                      data-testid={`assign-${r.prLineId}`}
                      value={assignment[r.prLineId] ?? ''}
                      onChange={(e) => setAssignment({ ...assignment, [r.prLineId]: e.target.value })}
                    >
                      <option value="">— not chosen —</option>
                      {data.candidates.map((c) => (
                        <option key={c.offerId} value={c.offerId}>
                          {c.supplierName}{c.offerKind === 'alternative' ? ` · ${c.offerLabel ?? 'alternative'}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {mode === 'split_award' && (
            <p style={s.warn} data-testid="split-notice">
              This is a <strong>split award</strong>: {chosenOfferIds.length} suppliers, one purchase
              order each. It has to say why the requirement is being sourced from more than one.
            </p>
          )}

          <div style={s.formRow}>
            <select style={s.input} data-testid="reason-code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">— reason (where one is owed) —</option>
              {REASON_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <input
              style={{ ...s.input, flex: 1 }} data-testid="reason-text" placeholder="Why this choice, in a sentence"
              value={reason} onChange={(e) => setReason(e.target.value)}
            />
            <button type="button" style={s.primary} data-testid="prepare" disabled={busy || !everyLineAssigned} onClick={prepare}>
              Record recommendation
            </button>
          </div>
          <p style={s.note}>
            A reason is required whenever the choice is not the lowest governed total, and always for
            a split — a departure from the cheapest option is exactly what a reviewer needs explained.
          </p>
        </div>
      )}

      {/* ── THE LIVE DECISION, AND WHAT MAY HAPPEN TO IT NEXT ───────────────── */}
      {live && (
        <div style={s.panel} data-testid="live-recommendation">
          <h2 style={s.h2}>
            Recommendation <span style={s.tag(live.recommendation.status)} data-testid="recommendation-status">{live.recommendation.status}</span>
          </h2>
          <p style={s.note} data-testid="recommendation-basis">
            {live.recommendation.mode === 'split_award' ? 'Split award' : 'Single supplier'} · compared in{' '}
            {live.recommendation.comparisonCurrency} at {live.recommendation.comparisonDate}
            {live.recommendation.reason && <> · {live.recommendation.reason}</>}
          </p>

          {live.staleness.stale && (
            <div style={s.error} data-testid="staleness">
              The ground has moved under this recommendation:
              {live.staleness.affected.map((a) => <div key={a.supplierName}>{a.detail}</div>)}
            </div>
          )}

          <table className="data-table" data-testid="selections">
            <thead>
              <tr><th style={s.th}>Supplier</th><th style={s.th}>Decided on</th><th style={s.th}>Value at the decision</th></tr>
            </thead>
            <tbody>
              {live.selections.map((sel) => (
                <tr key={sel.id} data-testid={`selection-${sel.offerId}`}>
                  <td style={s.td}><strong>{sel.supplierName}</strong></td>
                  <td style={s.td}>
                    {sel.coveredPrLineIds.length} requisition line{sel.coveredPrLineIds.length === 1 ? '' : 's'}
                    <span style={s.prov}>revision {sel.revisionId.slice(0, 8)}</span>
                  </td>
                  <td style={s.td} data-testid={`selection-total-${sel.offerId}`}>
                    {sel.governedTotal === null
                      ? <span style={s.unknown}>Not known</span>
                      : <><strong>{amount(sel.governedTotal, live.recommendation.comparisonCurrency)}</strong>
                        <span style={s.prov}>{sel.governedTotalBasis}</span></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={s.formRow}>
            {live.recommendation.status === 'draft' || live.recommendation.status === 'returned' ? (
              <button type="button" style={s.primary} data-testid="submit" disabled={busy}
                onClick={() => act(`recommendations/${live.recommendation.id}/submit`)}>
                Submit for approval
              </button>
            ) : null}

            {live.recommendation.status === 'submitted' && (
              <>
                <input style={{ ...s.input, flex: 1 }} data-testid="decision-note" placeholder="Note (optional)"
                  value={note} onChange={(e) => setNote(e.target.value)} />
                {(['approved', 'returned', 'rejected'] as const).map((decision) => (
                  <button key={decision} type="button" style={decision === 'approved' ? s.primary : s.smallBtn}
                    data-testid={`decide-${decision}`} disabled={busy}
                    onClick={() => act(`recommendations/${live.recommendation.id}/decision`, { decision, note: note || null })}>
                    {decision === 'approved' ? 'Approve' : decision === 'returned' ? 'Return to buyer' : 'Reject'}
                  </button>
                ))}
              </>
            )}

            {live.recommendation.status === 'approved' && (
              <button type="button" style={s.primary} data-testid="award" disabled={busy}
                onClick={() => act(`recommendations/${live.recommendation.id}/award`)}>
                Raise the purchase orders
              </button>
            )}

            {/*
              STANDING IT DOWN. An RFQ holds one live recommendation, and an approved one that must
              not be awarded — because a supplier has since revised their offer, because the job
              changed — would otherwise block the RFQ with no way out. It records why, and undoing
              something already approved needs the authority the approval needed.
            */}
            {live.recommendation.status !== 'awarded' && (
              <button type="button" style={s.smallBtn} data-testid="withdraw" disabled={busy || !note.trim()}
                title={note.trim() ? '' : 'Say why first — a withdrawn recommendation has to explain itself'}
                onClick={() => act(`recommendations/${live.recommendation.id}/withdraw`, { reason: note })}>
                Withdraw
              </button>
            )}
          </div>

          {live.recommendation.status !== 'submitted' && live.recommendation.status !== 'awarded' && (
            <input style={s.input} data-testid="withdraw-reason" placeholder="Reason, if you are withdrawing this"
              value={note} onChange={(e) => setNote(e.target.value)} />
          )}

          {live.recommendation.status === 'submitted' && (
            <p style={s.note}>
              The person who submitted a recommendation cannot approve it, and an approver is checked
              against both each supplier&rsquo;s award and the decision as a whole — so an amount beyond
              somebody&rsquo;s authority cannot be waved through by splitting it into smaller orders.
            </p>
          )}
        </div>
      )}

      {/* ── WHAT THE AWARD ACTUALLY PRODUCED ────────────────────────────────── */}
      {orders && (
        <div style={s.panel} data-testid="awarded-orders">
          <h2 style={s.h2}>Purchase orders raised</h2>
          <p style={s.note} data-testid="award-currency-note">
            Each order is in the supplier&rsquo;s <strong>own currency</strong>, at the prices and terms they
            quoted. The {data.context.baseCurrency} figures above were the basis for choosing between
            them; they are not what anybody is being asked to invoice.
          </p>
          <table className="data-table">
            <thead>
              <tr><th style={s.th}>Order</th><th style={s.th}>Supplier</th><th style={s.th}>Value</th><th style={s.th}>Terms</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-testid={`order-${o.id}`}>
                  <td style={s.td}><a href={`/procurement/purchase-orders/${o.id}`} style={s.link}>{o.reference ?? o.id.slice(0, 8)}</a></td>
                  <td style={s.td}>{o.supplierName}</td>
                  <td style={s.td} data-testid={`order-value-${o.id}`}><strong>{amount(o.value, o.currency)}</strong></td>
                  <td style={s.td}>
                    {o.freightAmount !== null && <span style={s.prov}>freight {amount(o.freightAmount, o.currency)}</span>}
                    {o.paymentTerms && <span style={s.prov}>{o.paymentTerms}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  basis: { border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface-2)' },
  basisRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  panel: { border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  h2: { fontSize: 17, margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
  label: { fontSize: 12.5, color: 'var(--muted)' },
  input: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 7, color: 'inherit', padding: '6px 9px', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 12, color: 'var(--muted)', fontWeight: 600, padding: '8px 10px' },
  td: { padding: '9px 10px', fontSize: 13.5, verticalAlign: 'top' },
  muted: { color: 'var(--muted)', fontSize: 13 },
  note: { color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55, margin: 0 },
  prov: { display: 'block', color: 'var(--muted)', fontSize: 11.5, marginTop: 2 },
  unknown: { display: 'block', color: 'var(--warn, #b8860b)', fontSize: 12.5, lineHeight: 1.5 },
  expired: { color: 'var(--bad)', fontSize: 12.5 },
  ok: { color: 'var(--good)', fontSize: 13, fontWeight: 600 },
  reasons: { margin: 0, paddingLeft: 16 },
  error: { border: '1px solid var(--bad)', borderRadius: 8, padding: '10px 12px', color: 'var(--bad)', fontSize: 13 },
  warn: { border: '1px solid var(--warn, #b8860b)', borderRadius: 8, padding: '10px 12px', fontSize: 13, margin: 0 },
  formRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-ink)', padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  smallBtn: { background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'inherit', padding: '7px 12px', fontSize: 13, cursor: 'pointer' },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  tag: (v: string): CSSProperties => ({
    fontSize: 11.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line)',
    color: v === 'approved' || v === 'awarded' ? 'var(--good)' : v === 'rejected' ? 'var(--bad)' : 'var(--muted)',
  }),
} satisfies Record<string, CSSProperties | ((v: string) => CSSProperties)>;
