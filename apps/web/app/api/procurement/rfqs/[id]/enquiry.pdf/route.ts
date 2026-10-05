import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * THE ENQUIRY ONE SUPPLIER RECEIVES (BUY-03).
 *
 * It FETCHES the governed enquiry and renders it — addressed to one invited supplier, from the
 * issuing company, listing what is asked for. The API decides what may be on it: only a sent RFQ,
 * only to a supplier it was sent to, and nothing internal — no estimated cost, no cost coding. This
 * route adds nothing to that and leaves nothing out.
 *
 * A requirement the request does not state (no specification, no needed-by date) is printed as not
 * stated: a blank reads as "anything will do", which is a term nobody agreed.
 */

interface Enquiry {
  rfq: { id: string; reference: string | null; title: string; dueDate: string | null; sentAt: string | null };
  supplier: { id: string; name: string; invitedAt: string };
  lines: Array<{
    lineNo: number; materialCode: string; materialName: string; specification: string | null;
    manufacturer: string | null; model: string | null; quantity: number; uom: string; needByDate: string | null;
  }>;
  issuer: { configured: boolean; name: string; legalName: string; trn: string; address: string; phone: string; email: string; website: string };
}

const safe = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'enquiry';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const supplierId = new URL(request.url).searchParams.get('supplierId') ?? '';
  let data: Enquiry;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/rfqs/${encodeURIComponent(id)}/enquiry?${new URLSearchParams({ supplierId })}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
    data = (await res.json()) as Enquiry;
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
  // The same refusal every outbound document makes: paper with no issuer cannot be answered.
  if (!data.issuer.configured) {
    return Response.json({ message: 'Configure the legal company name before generating supplier documents.' }, { status: 409 });
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const left = 16;
  const right = pdf.internal.pageSize.getWidth() - 16;
  const bottom = pdf.internal.pageSize.getHeight() - 18;
  let y = 18;
  const text = (value: string, x: number, opts: { size?: number; bold?: boolean; colour?: [number, number, number]; align?: 'left' | 'right' } = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 9);
    const [r, g, b] = opts.colour ?? [28, 33, 42];
    pdf.setTextColor(r, g, b);
    pdf.text(value, x, y, { align: opts.align ?? 'left' });
  };
  const muted: [number, number, number] = [90, 100, 110];
  const wrap = (value: string, x: number, width: number, opts: { size?: number; colour?: [number, number, number] } = {}) => {
    for (const part of pdf.splitTextToSize(value, width) as string[]) {
      if (y > bottom) { pdf.addPage(); y = 18; }
      text(part, x, opts);
      y += 4.2;
    }
  };

  // ── WHO IS ASKING ──────────────────────────────────────────────────────────────
  text(data.issuer.legalName || data.issuer.name, left, { size: 12, bold: true });
  y += 5;
  const contact = [data.issuer.address, data.issuer.phone, data.issuer.email, data.issuer.website].filter(Boolean).join('   ·   ');
  if (contact) { text(contact, left, { size: 8, colour: muted }); y += 4; }
  if (data.issuer.trn) { text(`TRN ${data.issuer.trn}`, left, { size: 8, colour: muted }); y += 4; }
  y += 4;

  text('REQUEST FOR QUOTATION', left, { size: 15, bold: true });
  text(data.rfq.reference ?? `RFQ ${data.rfq.id.slice(0, 8).toUpperCase()}`, right, { size: 10, bold: true, align: 'right' });
  y += 7;

  // ── TO WHOM, AND BY WHEN ───────────────────────────────────────────────────────
  pdf.setFillColor(243, 246, 248);
  pdf.rect(left, y - 4.5, right - left, 22, 'F');
  text('To', left + 3, { size: 8, colour: muted });
  text(data.supplier.name, left + 28, { size: 10, bold: true });
  y += 5.5;
  text('Subject', left + 3, { size: 8, colour: muted });
  text(data.rfq.title, left + 28, { size: 9 });
  y += 5.5;
  text('Issued', left + 3, { size: 8, colour: muted });
  text(data.rfq.sentAt ? data.rfq.sentAt.slice(0, 10) : 'not recorded', left + 28, { size: 9 });
  text('Quotation due', left + 95, { size: 8, colour: muted });
  text(data.rfq.dueDate ?? 'no date stated — please state your earliest validity', left + 120, { size: 9, bold: Boolean(data.rfq.dueDate) });
  y += 12;

  // ── WHAT IS ASKED FOR ──────────────────────────────────────────────────────────
  text('ITEMS REQUESTED', left, { size: 9.5, bold: true });
  y += 5;
  const cols = [left, left + 10, left + 112, left + 140, left + 158];
  ['#', 'Item', 'Quantity', 'Unit', 'Needed by'].forEach((h, i) => text(h, cols[i], { size: 7.8, bold: true, colour: muted }));
  y += 2.5;
  pdf.setDrawColor(190, 205, 213);
  pdf.line(left, y, right, y);
  y += 5;
  if (data.lines.length === 0) {
    wrap('This enquiry lists no items. Contact the sender for the scope before quoting.', left, right - left, { colour: [180, 83, 9] });
  }
  for (const line of data.lines) {
    if (y > bottom - 12) { pdf.addPage(); y = 18; }
    text(String(line.lineNo), cols[0]);
    text(`${line.materialCode} — ${line.materialName}`.slice(0, 70), cols[1], { bold: true });
    text(line.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 }), cols[2]);
    text(line.uom, cols[3]);
    text(line.needByDate ?? 'not stated', cols[4], { colour: line.needByDate ? undefined : muted });
    y += 4.4;
    const made = [line.manufacturer, line.model].filter(Boolean).join(' ');
    wrap(`Specification: ${line.specification ?? 'not stated'}${made ? `   ·   Make / model requested: ${made}` : ''}`, cols[1], cols[2] - cols[1] - 4, { size: 7.6, colour: [70, 80, 92] });
    y += 1.8;
  }

  // ── HOW TO ANSWER ──────────────────────────────────────────────────────────────
  y += 4;
  if (y > bottom - 34) { pdf.addPage(); y = 18; }
  text('PLEASE STATE IN YOUR QUOTATION', left, { size: 9.5, bold: true });
  y += 5;
  for (const ask of [
    'A unit price for each item, in the quantity and unit requested — or say plainly where you offer a different quantity or unit.',
    'The currency, and whether prices include or exclude tax, with the rate.',
    'Freight and delivery terms, payment terms, lead time per item, warranty, and how long the offer is valid.',
    'The make, model and part number you offer, and any technical or commercial deviation or exclusion.',
    `Our reference ${data.rfq.reference ?? data.rfq.title} on every page of your reply.`,
  ]) {
    text('•', left + 2, { size: 8.4 });
    wrap(ask, left + 6, right - left - 6, { size: 8.4 });
  }

  y = pdf.internal.pageSize.getHeight() - 10;
  text(`Issued to ${data.supplier.name} only. This is a request for a price; it is not an order and commits neither party.`, left, { size: 7.4, colour: muted });

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${safe(data.rfq.reference ?? data.rfq.title)}-enquiry-${safe(data.supplier.name)}.pdf"`,
    },
  });
}
