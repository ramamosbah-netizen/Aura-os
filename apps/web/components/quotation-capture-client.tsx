'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { CURRENCIES } from '@aura/shared';

/**
 * QC-01 stage A — a Buyer capturing a supplier quotation, and seeing what the supplier did before.
 *
 * The two things this screen exists to make possible, neither of which a buyer could do at all:
 *
 *   CAPTURE THE COMMERCIAL FACTS. The old form sent supplier, amount and a lead time the API
 *   refuses. Currency, tax treatment, tax rate, freight, payment terms and validity had nowhere to
 *   be typed, so every quotation reached the comparison as "the tax treatment was never stated".
 *
 *   READ THE HISTORY. A supplier moving from 92 with AED 500 freight to 95 with free freight has
 *   restructured the offer, and the buyer who sees only the price rise has read half of it. The
 *   previous revision used to be overwritten and simply gone.
 *
 * Nothing here computes money. It captures facts and shows what the API returned; comparing them is
 * SUP-06 and choosing between them is SUP-13.
 */

interface Revision {
  id: string;
  revisionNo: number;
  supplierRevisionRef: string | null;
  origin: 'captured' | 'legacy_migration';
  status: 'draft' | 'received' | 'confirmed' | 'superseded' | 'withdrawn' | 'rejected';
  receivedAt: string | null;
  quotationDate: string | null;
  validityDate: string | null;
  currency: string | null;
  taxTreatment: 'exclusive' | 'inclusive' | 'exempt' | null;
  taxRatePct: number | null;
  freightAmount: number | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  notes: string | null;
  supersedesRevisionId: string | null;
}

interface Change { field: string; from: string | number | null; to: string | number | null }

interface OfferWithHistory {
  offer: { id: string; kind: 'base' | 'alternative'; label: string | null };
  effective: Revision | null;
  noEffectiveReason: string | null;
  history: Array<{ revision: Revision; changesFromPrevious: Change[] }>;
}

interface Family {
  family: { id: string; supplierName: string; supplierQuotationRef: string | null };
  offers: OfferWithHistory[];
}

const BLANK = {
  supplierRevisionRef: '', quotationDate: '', validityDate: '', currency: 'AED',
  taxTreatment: '', taxRatePct: '', freightAmount: '', freightTerms: '', paymentTerms: '', notes: '',
};

const show = (v: string | number | null) => (v === null || v === '' ? '—' : String(v));

export default function QuotationCaptureClient({ rfqId }: { rfqId: string }) {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [supplierName, setSupplierName] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [openOffer, setOpenOffer] = useState<string | null>(null);
  const [facts, setFacts] = useState({ ...BLANK });

  const call = useCallback(async (path: string, init?: RequestInit): Promise<unknown | null> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/procurement/quotations/${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const body = await res.json().catch(() => ({}));
      // `message` before `error`: the envelope puts the machine code in `error` and the explanation
      // in `message`, and reading them the other way round shows a user the word BAD_REQUEST.
      if (!res.ok) { setErr((body as { message?: string; error?: string }).message ?? (body as { error?: string }).error ?? `Error ${res.status}`); return null; }
      return body;
    } catch { setErr('Procurement API unreachable'); return null; } finally { setBusy(false); }
  }, []);

  const reload = useCallback(async () => {
    const body = await call(`families?rfqId=${encodeURIComponent(rfqId)}`);
    if (Array.isArray(body)) setFamilies(body as Family[]);
  }, [call, rfqId]);

  useEffect(() => { void reload(); }, [reload]);

  async function openQuotation() {
    if (!supplierName.trim()) { setErr('Name the supplier this quotation came from'); return; }
    const created = await call('families', {
      method: 'POST',
      body: JSON.stringify({ rfqId, supplierName: supplierName.trim(), supplierQuotationRef: supplierRef.trim() || null }),
    });
    if (created) { setSupplierName(''); setSupplierRef(''); await reload(); }
  }

  async function captureRevision(offerId: string) {
    const payload: Record<string, unknown> = {
      supplierRevisionRef: facts.supplierRevisionRef.trim() || null,
      quotationDate: facts.quotationDate || null,
      validityDate: facts.validityDate || null,
      currency: facts.currency || null,
      taxTreatment: facts.taxTreatment || null,
      taxRatePct: facts.taxRatePct === '' ? null : Number(facts.taxRatePct),
      freightAmount: facts.freightAmount === '' ? null : Number(facts.freightAmount),
      freightTerms: facts.freightTerms.trim() || null,
      paymentTerms: facts.paymentTerms.trim() || null,
      notes: facts.notes.trim() || null,
      receivedAt: new Date().toISOString(),
    };
    const created = await call(`offers/${offerId}/revisions`, { method: 'POST', body: JSON.stringify(payload) });
    if (!created) return;
    // Captured as a draft, then marked received in the same action: the buyer is transcribing a
    // document that already exists, and a revision nobody ever marks received is invisible to SUP-06.
    const id = (created as { id: string }).id;
    if (await call(`revisions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'received' }) })) {
      setFacts({ ...BLANK }); setOpenOffer(null); await reload();
    }
  }

  async function setStatus(revisionId: string, status: string) {
    if (await call(`revisions/${revisionId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })) await reload();
  }

  async function addAlternative(familyId: string) {
    const label = window.prompt('What is being offered instead? (e.g. "Bosch equivalent")');
    if (!label?.trim()) return;
    if (await call(`families/${familyId}/offers`, { method: 'POST', body: JSON.stringify({ label: label.trim() }) })) await reload();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {err && <div style={s.error} role="alert" data-testid="capture-error">{err}</div>}

      <div style={s.panel}>
        <div style={s.label}>Record a supplier quotation</div>
        <div style={s.row}>
          <input style={s.input} placeholder="Supplier" data-testid="new-supplier"
            value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          <input style={s.input} placeholder="Supplier's quotation ref (e.g. Q-1001)" data-testid="new-supplier-ref"
            value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />
          <button type="button" className="btn btn-primary" data-testid="open-quotation"
            onClick={openQuotation} disabled={busy}>Open quotation</button>
        </div>
      </div>

      {families === null && <div style={s.muted}>Loading quotations…</div>}
      {families?.length === 0 && (
        <div style={s.panel} data-testid="no-quotations">
          No supplier quotations recorded against this RFQ yet.
        </div>
      )}

      {families?.map(({ family, offers }) => (
        <div key={family.id} style={s.panel} data-testid={`family-${family.id}`}>
          <div style={s.familyHead}>
            <div>
              <strong style={{ fontSize: 15 }}>{family.supplierName}</strong>
              <span style={s.muted}>  {family.supplierQuotationRef ? `· ${family.supplierQuotationRef}` : '· no supplier reference given'}</span>
            </div>
            <button type="button" className="btn btn-ghost" style={s.sm}
              data-testid={`add-alternative-${family.id}`} onClick={() => addAlternative(family.id)}>+ Alternative offer</button>
          </div>

          {offers.map(({ offer, effective, noEffectiveReason, history }) => (
            <div key={offer.id} style={s.offer} data-testid={`offer-${offer.id}`}>
              <div style={s.offerHead}>
                <span style={s.kind}>{offer.kind === 'base' ? 'Base offer' : `Alternative — ${offer.label}`}</span>
                <button type="button" className="btn btn-ghost" style={s.sm}
                  data-testid={`capture-revision-${offer.id}`}
                  onClick={() => setOpenOffer(openOffer === offer.id ? null : offer.id)}>
                  {openOffer === offer.id ? 'Cancel' : '+ Revision'}
                </button>
              </div>

              {/* THE EFFECTIVE OFFER, or a sentence saying why there is none. Never blank. */}
              {effective ? (
                <div style={s.effective} data-testid={`effective-${offer.id}`}>
                  <strong>Rev {effective.revisionNo} is the current offer</strong>
                  <span style={s.muted}>
                    {' '}· {effective.currency ?? 'currency not stated'} · tax {effective.taxTreatment ?? 'not stated'}
                    {effective.taxTreatment === 'inclusive' ? ` at ${effective.taxRatePct}%` : ''}
                    {' '}· freight {effective.freightAmount === null ? 'not quoted' : effective.freightAmount}
                    {' '}· valid to {effective.validityDate ?? 'no date given'}
                  </span>
                </div>
              ) : (
                <div style={s.noEffective} data-testid={`no-effective-${offer.id}`}>
                  No current offer — {noEffectiveReason}
                </div>
              )}

              {openOffer === offer.id && (
                <div style={s.form} data-testid={`revision-form-${offer.id}`}>
                  <div style={s.grid}>
                    <Field label="Supplier's revision ref" testId="rev-ref"
                      value={facts.supplierRevisionRef} onChange={(v) => setFacts({ ...facts, supplierRevisionRef: v })} />
                    <Field label="Quotation date" type="date" testId="rev-quotation-date"
                      value={facts.quotationDate} onChange={(v) => setFacts({ ...facts, quotationDate: v })} />
                    <Field label="Valid until" type="date" testId="rev-validity"
                      value={facts.validityDate} onChange={(v) => setFacts({ ...facts, validityDate: v })} />
                    <div style={s.field}>
                      <label style={s.fieldLabel} htmlFor="rev-currency">Currency</label>
                      <select id="rev-currency" style={s.input} data-testid="rev-currency"
                        value={facts.currency} onChange={(e) => setFacts({ ...facts, currency: e.target.value })}>
                        {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={s.field}>
                      <label style={s.fieldLabel} htmlFor="rev-tax">Tax treatment</label>
                      <select id="rev-tax" style={s.input} data-testid="rev-tax-treatment"
                        value={facts.taxTreatment} onChange={(e) => setFacts({ ...facts, taxTreatment: e.target.value })}>
                        <option value="">Not stated</option>
                        <option value="exclusive">Exclusive of tax</option>
                        <option value="inclusive">Inclusive of tax</option>
                        <option value="exempt">Exempt</option>
                      </select>
                    </div>
                    <Field label="Tax rate %" type="number" testId="rev-tax-rate"
                      value={facts.taxRatePct} onChange={(v) => setFacts({ ...facts, taxRatePct: v })} />
                    <Field label="Freight amount" type="number" testId="rev-freight"
                      value={facts.freightAmount} onChange={(v) => setFacts({ ...facts, freightAmount: v })} />
                    <Field label="Freight terms" testId="rev-freight-terms"
                      value={facts.freightTerms} onChange={(v) => setFacts({ ...facts, freightTerms: v })} />
                    <Field label="Payment terms" testId="rev-payment-terms"
                      value={facts.paymentTerms} onChange={(v) => setFacts({ ...facts, paymentTerms: v })} />
                  </div>
                  <p style={s.hint}>
                    Anything the supplier did not state is left blank and recorded as unknown — it is
                    never assumed. Lead time is recorded per item on the quotation line, not here,
                    because one overall figure cannot say when each item arrives.
                  </p>
                  <button type="button" className="btn btn-primary" data-testid={`save-revision-${offer.id}`}
                    onClick={() => captureRevision(offer.id)} disabled={busy}>Record revision</button>
                </div>
              )}

              {/* THE HISTORY. Superseded revisions stay, and the diff says what the supplier changed. */}
              {history.length > 0 && (
                <table className="data-table" data-testid={`history-${offer.id}`}>
                  <thead><tr>{['Revision', 'Status', 'Currency', 'Tax', 'Freight', 'Valid to', 'Changed from previous', ''].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {history.map(({ revision, changesFromPrevious }) => (
                      <tr key={revision.id} data-testid={`revision-${revision.id}`}>
                        <td style={s.td}>
                          <strong>Rev {revision.revisionNo}</strong>
                          {revision.origin === 'legacy_migration' && <span style={s.tag}>recorded before revisions existed</span>}
                          {revision.supplierRevisionRef && <span style={s.muted}> · {revision.supplierRevisionRef}</span>}
                        </td>
                        <td style={s.td}><span style={revision.status === 'confirmed' ? s.statusOn : s.statusOff}>{revision.status}</span></td>
                        <td style={s.td}>{show(revision.currency)}</td>
                        <td style={s.td}>{revision.taxTreatment ?? <span style={s.unknown}>not stated</span>}</td>
                        <td style={s.td}>{revision.freightAmount === null ? <span style={s.unknown}>not quoted</span> : revision.freightAmount}</td>
                        <td style={s.td}>{show(revision.validityDate)}</td>
                        <td style={s.td} data-testid={`changes-${revision.id}`}>
                          {changesFromPrevious.length === 0
                            ? <span style={s.muted}>—</span>
                            : changesFromPrevious.map((c) => (
                                <div key={c.field} style={s.change}>{c.field}: {show(c.from)} → {show(c.to)}</div>
                              ))}
                        </td>
                        <td style={s.td}>
                          {revision.status === 'received' && (
                            <button type="button" className="btn btn-ghost" style={s.sm}
                              data-testid={`confirm-${revision.id}`} onClick={() => setStatus(revision.id, 'confirmed')}>Make current</button>
                          )}
                          {revision.status === 'confirmed' && (
                            <button type="button" className="btn btn-ghost" style={s.sm}
                              data-testid={`withdraw-${revision.id}`} onClick={() => setStatus(revision.id, 'withdrawn')}>Withdrawn by supplier</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, testId, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; testId: string; type?: string;
}) {
  return (
    <div style={s.field}>
      <label style={s.fieldLabel} htmlFor={testId}>{label}</label>
      <input id={testId} style={s.input} type={type} data-testid={testId}
        value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const cell: CSSProperties = { padding: '7px 9px', borderBottom: '1px solid var(--border)', fontSize: 12.5, verticalAlign: 'top' };
const s: Record<string, CSSProperties> = {
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11.5, color: 'var(--muted)', letterSpacing: 0.3 },
  input: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 10px', fontSize: 13, minWidth: 150 },
  label: { fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--muted)' },
  familyHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  offer: { borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 },
  offerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  kind: { fontSize: 12.5, fontWeight: 600 },
  effective: { fontSize: 12.5, margin: '8px 0' },
  noEffective: { fontSize: 12.5, margin: '8px 0', color: 'var(--warn, #b45309)', fontStyle: 'italic' },
  form: { background: 'var(--bg, transparent)', border: '1px dashed var(--border)', borderRadius: 8, padding: 12, margin: '10px 0' },
  hint: { color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: '10px 0' },
  th: { ...cell, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' },
  td: cell,
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  unknown: { color: 'var(--warn, #b45309)', fontSize: 12, fontStyle: 'italic' },
  statusOn: { fontWeight: 700, fontSize: 12 },
  statusOff: { color: 'var(--muted)', fontSize: 12 },
  change: { fontSize: 12, color: 'var(--warn, #b45309)' },
  tag: { display: 'block', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' },
  sm: { padding: '4px 10px', fontSize: 12.5 },
  error: { background: 'var(--panel)', border: '1px solid var(--danger, #b91c1c)', borderRadius: 8, padding: 12, fontSize: 13 },
};
