import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * THE COMMERCIAL COMPARISON SHEET (SUP-06).
 *
 * It FETCHES the governed comparison and renders it. It computes no money: no totals, no
 * conversions, no ranking. That is structural, not stylistic — a PDF that recalculated anything
 * would be a second opinion that could disagree with the screen it was printed from, and a printed
 * disagreement is the one nobody notices until it is in front of a client.
 *
 * An UNKNOWN is printed as the reason it is unknown. A blank cell in a comparison sheet reads as
 * "nothing to say"; a zero reads as "free". Both are lies this refuses to tell.
 *
 * There is no recommendation on this sheet and no offer is marked. SUP-13 owns that.
 */

interface Value {
  status: 'comparable' | 'unknown';
  unitValue?: number;
  currency?: string;
  fx?: { source: string; effectiveDate: string | null; rate: number };
  reason?: string;
  missingInputs?: string[];
}

interface Comparison {
  requestedQuantity: number | null;
  requestedUom: string | null;
  materialCode: string | null;
  materialName: string | null;
  context: { baseCurrency: string; comparisonDate: string };
  offers: Array<{
    supplierName: string;
    requestedQuantity: number | null; quotedQuantity: number | null;
    requestedUom: string | null; quotedUom: string | null;
    quantityDeviation: number | null; coverageRatio: number | null;
    quantityCompliance: string;
    normalisedUnitPrice: Value; normalisedRequestedLineTotal: Value;
    commercialStatus: string; validityDate: string | null;
  }>;
  quotations: Array<{
    supplierName: string; currency: string | null; freight: Value | null;
    freightTerms: string | null; paymentTerms: string | null; commercialStatus: string;
  }>;
}

const REASONS: Record<string, string> = {
  not_quoted: 'supplier did not bid this line',
  unit_price_unknown: 'no unit price given',
  quantity_unknown: 'no quantity given',
  currency_unknown: 'offer names no currency',
  tax_treatment_unknown: 'tax treatment never stated',
  tax_rate_unknown: 'tax inclusive, no rate given',
  uom_mismatch: 'units differ, no governed conversion',
  no_governed_rate: 'no governed exchange rate on this date',
  quoted_quantity_differs: 'supplier offered a different quantity',
};

const show = (v: Value): string =>
  v.status === 'comparable'
    ? `${v.unitValue!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${v.currency}`
    : `Not known — ${REASONS[v.reason ?? ''] ?? v.reason}`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ prLineId: string }> },
): Promise<Response> {
  const { prLineId } = await params;
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['comparisonDate', 'baseCurrency']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  let data: Comparison;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison?${query}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return Response.json(body, { status: res.status });
    }
    data = (await res.json()) as Comparison;
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const left = 12;
  const right = pdf.internal.pageSize.getWidth() - 12;
  let y = 16;

  const text = (value: string, x: number, opts: { size?: number; bold?: boolean; colour?: [number, number, number]; align?: 'left' | 'right' } = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 8.5);
    const [r, g, b] = opts.colour ?? [28, 33, 42];
    pdf.setTextColor(r, g, b);
    pdf.text(value, x, y, { align: opts.align ?? 'left' });
  };

  text('COMMERCIAL COMPARISON', left, { size: 14, bold: true });
  text(`${data.materialCode ?? ''} ${data.materialName ?? ''}`.trim(), right, { size: 9, align: 'right', colour: [90, 100, 110] });
  y += 7;

  // THE BASIS, before any figure. Numbers read without it are numbers whose meaning is guessed.
  pdf.setFillColor(243, 246, 248);
  pdf.rect(left, y - 4, right - left, 15, 'F');
  text(
    `Comparison date ${data.context.comparisonDate}   ·   valued in ${data.context.baseCurrency}   ·   ex-tax   ·   line values exclude freight`,
    left + 3, { size: 8.5, bold: true },
  );
  y += 5;
  text(
    `Requested ${data.requestedQuantity ?? '—'} ${data.requestedUom ?? ''}   ·   foreign amounts converted at governed rates only   ·   figures marked "Not known" could not be put on this basis`,
    left + 3, { size: 7.8, colour: [90, 100, 110] },
  );
  y += 12;

  const cols = [left, left + 62, left + 118, left + 172, left + 225];
  const header = ['Supplier', 'Quantity offered / requested', `Unit price (${data.context.baseCurrency}, ex-tax)`, 'Requisition line total', 'Offer validity'];
  header.forEach((h, i) => text(h, cols[i], { size: 7.6, bold: true, colour: [90, 100, 110] }));
  y += 3;
  pdf.setDrawColor(190, 205, 213);
  pdf.line(left, y, right, y);
  y += 5;

  for (const offer of data.offers) {
    if (y > pdf.internal.pageSize.getHeight() - 30) { pdf.addPage(); y = 18; }
    const priceKnown = offer.normalisedUnitPrice.status === 'comparable';
    const totalKnown = offer.normalisedRequestedLineTotal.status === 'comparable';
    const amber: [number, number, number] = [180, 83, 9];

    text(offer.supplierName, cols[0], { size: 8.5, bold: true });
    text(
      `${offer.quotedQuantity ?? '—'} ${offer.quotedUom ?? ''} / ${offer.requestedQuantity ?? '—'} ${offer.requestedUom ?? ''}`,
      cols[1], { size: 8.5 },
    );
    text(show(offer.normalisedUnitPrice), cols[2], { size: 8.5, bold: priceKnown, colour: priceKnown ? undefined : amber });
    text(show(offer.normalisedRequestedLineTotal), cols[3], { size: 8.5, bold: totalKnown, colour: totalKnown ? undefined : amber });
    text(
      offer.commercialStatus === 'expired' ? `EXPIRED ${offer.validityDate ?? ''}`
        : offer.commercialStatus === 'live' ? `valid to ${offer.validityDate ?? ''}`
        : 'no validity date',
      cols[4], { size: 8.5, colour: offer.commercialStatus === 'expired' ? [185, 28, 28] : [90, 100, 110] },
    );
    y += 4.5;

    // The deviation and the FX provenance, beneath the row they qualify.
    const notes: string[] = [];
    if (offer.quantityCompliance === 'deviated') {
      notes.push(`quantity deviation ${offer.quantityDeviation! > 0 ? '+' : ''}${offer.quantityDeviation}, covers ${(offer.coverageRatio! * 100).toFixed(1)}% of the requirement`);
    }
    if (priceKnown && offer.normalisedUnitPrice.fx!.source !== 'identity') {
      notes.push(`converted at ${offer.normalisedUnitPrice.fx!.rate}, governed rate effective ${offer.normalisedUnitPrice.fx!.effectiveDate}`);
    }
    if (notes.length > 0) { text(notes.join('   ·   '), cols[1], { size: 7.2, colour: [110, 120, 130] }); y += 4; }
    y += 2.5;
  }

  y += 6;
  if (y > pdf.internal.pageSize.getHeight() - 45) { pdf.addPage(); y = 18; }
  text('QUOTATION-LEVEL CHARGES', left, { size: 9, bold: true });
  y += 4;
  text(
    'Freight is quoted for each offer as a whole. It is NOT included in the unit prices above and is NOT allocated across lines; accounting for it may change which offer is better value.',
    left, { size: 7.6, colour: [90, 100, 110] },
  );
  y += 6;
  for (const q of data.quotations) {
    if (y > pdf.internal.pageSize.getHeight() - 22) { pdf.addPage(); y = 18; }
    text(q.supplierName, cols[0], { size: 8.5 });
    text(q.currency ?? 'currency not stated', cols[1], { size: 8.5 });
    text(q.freight === null ? 'no freight quoted' : show(q.freight), cols[2], { size: 8.5 });
    text(q.freightTerms ?? '—', cols[3], { size: 8.5 });
    text(q.paymentTerms ?? '—', cols[4], { size: 8.5 });
    y += 5;
  }

  y = pdf.internal.pageSize.getHeight() - 12;
  text(
    'These are comparable facts, not a recommendation. No offer on this sheet is ranked, preferred or selected; choosing a supplier is a separate governed decision.',
    left, { size: 7.6, bold: true, colour: [90, 100, 110] },
  );

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  const safe = (data.materialCode ?? prLineId).replace(/[^a-zA-Z0-9._-]+/g, '-');
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${safe}-commercial-comparison-${data.context.comparisonDate}.pdf"`,
    },
  });
}
