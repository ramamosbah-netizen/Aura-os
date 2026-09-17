'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * SUP-06 on screen — comparable facts, and nothing pretending to be a decision.
 *
 * Everything here is rendered from ONE governed result fetched from the API. The screen computes no
 * money of its own: no totals, no conversions, no "cheapest". That is not laziness, it is the point
 * — a figure recomputed in the browser is a second answer that can disagree with the first, and the
 * whole of SUP-06 is about two figures never being allowed to disagree.
 *
 * It also does not sort by price. An ordering IS a recommendation, and recommendation is SUP-13's.
 */

interface Value {
  status: 'comparable' | 'unknown';
  unitValue?: number;
  currency?: string;
  comparisonDate?: string;
  taxBasis?: string;
  freightBasis?: string;
  fx?: { source: string; effectiveDate: string | null; rateId: string | null; rate: number };
  reason?: string;
  missingInputs?: string[];
}

interface Offer {
  quotationId: string;
  quotationLineId: string;
  supplierName: string;
  requestedQuantity: number | null;
  requestedUom: string | null;
  quotedQuantity: number | null;
  quotedUom: string | null;
  quantityDeviation: number | null;
  coverageRatio: number | null;
  quantityCompliance: 'exact' | 'deviated' | 'unknown';
  normalisedUnitPrice: Value;
  normalisedRequestedLineTotal: Value;
  commercialStatus: 'live' | 'expired' | 'validity_unknown';
  validityDate: string | null;
}

interface QuotationComponents {
  quotationId: string;
  supplierName: string;
  currency: string | null;
  freight: Value | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  commercialStatus: Offer['commercialStatus'];
  validityDate: string | null;
}

interface Comparison {
  prLineId: string;
  requestedQuantity: number | null;
  requestedUom: string | null;
  materialCode: string | null;
  materialName: string | null;
  context: { baseCurrency: string; comparisonDate: string };
  offers: Offer[];
  quotations: QuotationComponents[];
}

const REASONS: Record<string, string> = {
  not_quoted: 'the supplier did not bid this line',
  unit_price_unknown: 'no unit price was given',
  quantity_unknown: 'no quantity was given',
  currency_unknown: 'the offer names no currency',
  tax_treatment_unknown: 'the tax treatment was never stated',
  tax_rate_unknown: 'tax is inclusive but no rate was given',
  uom_mismatch: 'the units of measure differ, and no conversion is governed',
  no_governed_rate: 'no governed exchange rate for that currency on this date',
  quoted_quantity_differs: 'the supplier offered a different quantity, so this total is not known',
};

function money(v: Value): string {
  if (v.status !== 'comparable') return '—';
  return `${v.unitValue!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${v.currency}`;
}

/** An UNKNOWN is shown as a SENTENCE, never as a blank or a zero. A blank gets read as nothing. */
function Unknown({ value, testId }: { value: Value; testId: string }) {
  return (
    <span style={s.unknown} data-testid={testId} title={value.missingInputs?.join('; ')}>
      Not known — {REASONS[value.reason ?? ''] ?? value.reason}
    </span>
  );
}

export default function CommercialComparisonClient({ prLineId }: { prLineId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [comparisonDate, setComparisonDate] = useState(today);
  const [data, setData] = useState<Comparison | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (date: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/procurement/requirements/${prLineId}/comparison?comparisonDate=${date}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.message ?? body.error ?? `Error ${res.status}`); setData(null); }
      else setData(body as Comparison);
    } catch { setErr('Procurement API unreachable'); } finally { setBusy(false); }
  }, [prLineId]);

  useEffect(() => { void load(comparisonDate); }, [load, comparisonDate]);

  if (err) return <div style={s.error} data-testid="comparison-error">{err}</div>;
  if (!data) return <div style={s.muted}>Loading comparison…</div>;

  const href = (ext: string) =>
    `/api/procurement/requirements/${prLineId}/comparison.${ext}?comparisonDate=${data.context.comparisonDate}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/*
        THE BASIS, STATED BEFORE ANY NUMBER. Every figure below is true only under these terms, and a
        buyer who cannot see them is reading numbers whose meaning they have to guess.
      */}
      <div style={s.basis} data-testid="comparison-basis">
        <div style={s.basisRow}>
          <label style={s.label} htmlFor="comparison-date">Comparison date</label>
          <input
            id="comparison-date"
            data-testid="comparison-date"
            type="date"
            value={comparisonDate}
            onChange={(e) => setComparisonDate(e.target.value)}
            style={s.input}
          />
          <span style={s.muted} data-testid="comparison-context">
            Valued in <strong>{data.context.baseCurrency}</strong> · ex-tax · line values exclude freight
          </span>
        </div>
        <p style={s.note} data-testid="comparison-no-recommendation">
          These are comparable facts, not a recommendation. Nothing here is ranked or marked as
          preferred; choosing a supplier is a separate, governed decision.
        </p>
      </div>

      <div className="table-scroll">
        <table className="data-table" data-testid="comparison-table">
          <thead>
            <tr>
              {['Supplier', 'Quantity', `Unit price (${data.context.baseCurrency})`, `Requisition line total`, 'Offer'].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.offers.map((o) => (
              <tr key={o.quotationLineId} data-testid={`offer-${o.quotationLineId}`}>
                <td style={s.td}><strong>{o.supplierName}</strong></td>

                {/* QUANTITY AND UoM DEVIATIONS, shown as facts rather than folded into a flag. */}
                <td style={s.td} data-testid={`quantity-${o.quotationLineId}`}>
                  {o.quotedQuantity ?? '—'} {o.quotedUom ?? ''} offered against {o.requestedQuantity ?? '—'} {o.requestedUom ?? ''} requested
                  {o.quantityCompliance === 'deviated' && (
                    <span style={s.flag} data-testid={`deviation-${o.quotationLineId}`}>
                      {o.quantityDeviation! > 0 ? '+' : ''}{o.quantityDeviation} · covers {(o.coverageRatio! * 100).toFixed(1)}%
                    </span>
                  )}
                  {o.quotedUom && o.requestedUom && o.quotedUom.trim().toLowerCase() !== o.requestedUom.trim().toLowerCase() && (
                    <span style={s.flag} data-testid={`uom-mismatch-${o.quotationLineId}`}>different unit</span>
                  )}
                </td>

                <td style={s.td} data-testid={`unit-price-${o.quotationLineId}`}>
                  {o.normalisedUnitPrice.status === 'comparable' ? (
                    <>
                      <strong>{money(o.normalisedUnitPrice)}</strong>
                      <span style={s.prov} data-testid={`fx-${o.quotationLineId}`}>
                        {o.normalisedUnitPrice.fx!.source === 'identity'
                          ? 'no conversion'
                          : `at ${o.normalisedUnitPrice.fx!.rate}, governed rate effective ${o.normalisedUnitPrice.fx!.effectiveDate}`}
                      </span>
                    </>
                  ) : <Unknown value={o.normalisedUnitPrice} testId={`unit-price-unknown-${o.quotationLineId}`} />}
                </td>

                <td style={s.td} data-testid={`line-total-${o.quotationLineId}`}>
                  {o.normalisedRequestedLineTotal.status === 'comparable'
                    ? <strong>{money(o.normalisedRequestedLineTotal)}</strong>
                    : <Unknown value={o.normalisedRequestedLineTotal} testId={`line-total-unknown-${o.quotationLineId}`} />}
                </td>

                {/* The offer's own validity — a separate fact from whether its price is known. */}
                <td style={s.td} data-testid={`status-${o.quotationLineId}`}>
                  {o.commercialStatus === 'expired' && <span style={s.expired}>Expired {o.validityDate}</span>}
                  {o.commercialStatus === 'live' && <span style={s.muted}>Valid to {o.validityDate}</span>}
                  {o.commercialStatus === 'validity_unknown' && <span style={s.unknown}>No validity date given</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FREIGHT, at the level it was actually quoted at and never pushed into a line. */}
      <div style={s.panel} data-testid="quotation-charges">
        <div style={s.label}>Quotation-level charges</div>
        <p style={s.note}>
          Freight is quoted for each offer as a whole, so it is <strong>not</strong> included in the
          unit prices above and is <strong>not</strong> allocated across lines. Accounting for it may
          change which offer is better value.
        </p>
        <table className="data-table">
          <thead><tr>{['Supplier', 'Currency', `Freight (${data.context.baseCurrency}, ex-tax)`, 'Freight terms', 'Payment terms'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {data.quotations.map((q) => (
              <tr key={q.quotationId} data-testid={`charges-${q.quotationId}`}>
                <td style={s.td}>{q.supplierName}</td>
                <td style={s.td}>{q.currency ?? <span style={s.unknown}>not stated</span>}</td>
                <td style={s.td} data-testid={`freight-${q.quotationId}`}>
                  {q.freight === null
                    ? <span style={s.muted}>none quoted</span>
                    : q.freight.status === 'comparable'
                      ? money(q.freight)
                      : <Unknown value={q.freight} testId={`freight-unknown-${q.quotationId}`} />}
                </td>
                <td style={s.td}>{q.freightTerms ?? '—'}</td>
                <td style={s.td}>{q.paymentTerms ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Both exports read the SAME governed result this screen is showing. */}
      <div style={s.basisRow}>
        <a style={s.btn} href={href('xlsx')} data-testid="export-xlsx">Export comparison (XLSX)</a>
        <a style={s.btn} href={href('pdf')} data-testid="export-pdf">Comparison sheet (PDF)</a>
        {busy && <span style={s.muted}>Recalculating…</span>}
      </div>
    </div>
  );
}

const cell: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 13, verticalAlign: 'top' };
const s: Record<string, CSSProperties> = {
  basis: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  basisRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--muted)' },
  input: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 10px', fontSize: 13 },
  note: { color: 'var(--muted)', fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.5, maxWidth: 760 },
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  th: { ...cell, textAlign: 'left', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)' },
  td: cell,
  muted: { color: 'var(--muted)', fontSize: 12.5 },
  unknown: { color: 'var(--warn, #b45309)', fontSize: 12.5, fontStyle: 'italic' },
  expired: { color: 'var(--danger, #b91c1c)', fontSize: 12.5, fontWeight: 600 },
  prov: { display: 'block', color: 'var(--muted)', fontSize: 11.5, marginTop: 2 },
  flag: { display: 'block', color: 'var(--warn, #b45309)', fontSize: 11.5, marginTop: 2 },
  error: { background: 'var(--panel)', border: '1px solid var(--danger, #b91c1c)', borderRadius: 8, padding: 12, fontSize: 13 },
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '7px 12px', fontSize: 13, textDecoration: 'none' },
};
