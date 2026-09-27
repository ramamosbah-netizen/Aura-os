import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface QuoteLine {
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  vatRate: number;
  lineNet: number;
}

interface Quotation {
  quoteNumber: string;
  revision: number;
  customerName: string;
  subject?: string | null;
  issueDate: string;
  validUntil: string | null;
  status: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  terms?: string | null;
  exclusions?: string[];
  paymentConditions?: string | null;
  deliveryTerms?: string | null;
  lines: QuoteLine[];
}

/** EST-18 — what the customer documents rest on (GET /crm/quotations/:id/proposal-basis). Customer-facing only. */
interface ProposalBasis {
  status: string;
  supersedes: { quoteNumber: string; revision: number; reason: string | null } | null;
  supersededBy: { quoteNumber: string; revision: number; status: string } | null;
  technicalBasis: {
    reference: string; title: string; inputRevision: string; approvedAt: string | null; scopeSummary: string;
    systems: Array<{ discipline: string; name: string; designBasis: string }>;
    deviations: Array<{ requirementRef: string; description: string; resolution: string }>;
    clarifications: Array<{ reference: string; question: string; answer: string }>;
    assumptions: string[]; exclusions: string[];
  } | null;
}

/** Statuses in which this revision may be in the customer's hands as a valid offer. */
const ISSUABLE = new Set(['approved', 'sent', 'under_negotiation', 'accepted']);

/**
 * What the page says about whether this revision is a valid offer. A draft or a revision under
 * review is not approved for issue (nothing reaches a customer unapproved); a superseded revision
 * names what replaced it; a closed one says it is closed.
 */
function statusBanner(quotation: Quotation, basis: ProposalBasis | null): string | null {
  if (quotation.status === 'revised') {
    return basis?.supersededBy ? `SUPERSEDED BY REV ${basis.supersededBy.revision} - NOT VALID FOR ACCEPTANCE` : 'SUPERSEDED - NOT VALID FOR ACCEPTANCE';
  }
  if (quotation.status === 'draft' || quotation.status === 'internal_review') return 'DRAFT - NOT APPROVED FOR ISSUE';
  if (!ISSUABLE.has(quotation.status)) return `${quotation.status.replaceAll('_', ' ').toUpperCase()} - NOT VALID FOR ACCEPTANCE`;
  return null;
}

interface DocumentIdentity {
  name: string;
  configured: boolean;
  legalName: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
}

const money = (value: number, currency: string): string =>
  `${currency} ${Number(value).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeFilename = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'quotation';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = await authHeader();
  const [quotationResponse, identityResponse, basisResponse] = await Promise.all([
    apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}`, { headers, cache: 'no-store' }),
    apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/document-identity`, { headers, cache: 'no-store' }),
    // Optional to the document: an unreadable basis leaves it printable without the basis.
    Promise.resolve()
      .then(() => apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/proposal-basis`, { headers, cache: 'no-store' }))
      .then((response) => response ?? null).catch(() => null),
  ]);
  if (!quotationResponse.ok) {
    return Response.json(await quotationResponse.json().catch(() => ({ message: 'Quotation unavailable' })), { status: quotationResponse.status });
  }
  if (!identityResponse.ok) {
    return Response.json(await identityResponse.json().catch(() => ({ message: 'Company identity unavailable' })), { status: identityResponse.status });
  }

  const quotation = await quotationResponse.json() as Quotation;
  const identity = await identityResponse.json() as DocumentIdentity;
  // The offer still prints without its basis (an older record, a transient read); what it cannot do
  // is print a basis it did not read.
  const basis = basisResponse?.ok ? await basisResponse.json().catch(() => null) as ProposalBasis | null : null;
  const technical = basis?.technicalBasis ?? null;
  if (!identity.configured) {
    return Response.json(
      { message: 'Configure the legal company name in Administration before generating customer documents.' },
      { status: 409 },
    );
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 16;
  const right = pageWidth - 16;
  let y = 16;

  const addPage = (): void => {
    pdf.addPage();
    y = 16;
  };
  const ensure = (height: number): void => { if (y + height > pageHeight - 20) addPage(); };
  const text = (value: string, x: number, opts: { size?: number; bold?: boolean; align?: 'left' | 'right' | 'center' } = {}): void => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 9);
    pdf.text(value, x, y, { align: opts.align ?? 'left' });
  };
  const paragraph = (value: string, indent = 0): void => {
    const lines = pdf.splitTextToSize(value, right - left - indent) as string[];
    ensure(lines.length * 4 + 2);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(lines, left + indent, y);
    y += lines.length * 4 + 2;
  };

  pdf.setTextColor(25, 30, 40);
  text(identity.legalName || identity.name, left, { size: 16, bold: true });
  text('CUSTOMER QUOTATION', right, { size: 13, bold: true, align: 'right' });
  y += 6;
  text([identity.address, identity.trn ? `TRN ${identity.trn}` : '', identity.email, identity.phone].filter(Boolean).join(' | '), left, { size: 8 });
  text(`${quotation.quoteNumber} | Rev ${quotation.revision ?? 0}`, right, { size: 9, bold: true, align: 'right' });
  y += 5;
  pdf.setDrawColor(40, 45, 55);
  pdf.line(left, y, right, y);
  y += 7;

  const banner = statusBanner(quotation, basis);
  if (banner) {
    pdf.setFillColor(180, 35, 45);
    pdf.rect(left, y - 5, right - left, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    text(banner, pageWidth / 2, { size: 10, bold: true, align: 'center' });
    pdf.setTextColor(25, 30, 40);
    y += 8;
  }
  if (basis?.supersedes) {
    const why = basis.supersedes.reason ? ` - ${basis.supersedes.reason}` : '';
    paragraph(`Revision ${quotation.revision}: supersedes ${basis.supersedes.quoteNumber} Rev ${basis.supersedes.revision}${why}`);
  }

  text('QUOTE TO', left, { size: 8, bold: true });
  y += 5;
  text(quotation.customerName, left, { size: 11, bold: true });
  text(`Issue: ${quotation.issueDate}`, right, { align: 'right' });
  y += 5;
  if (quotation.validUntil) text(`Valid until: ${quotation.validUntil}`, right, { align: 'right' });
  if (quotation.subject) { text('Subject', left, { size: 8, bold: true }); y += 4; paragraph(quotation.subject); }
  y += 3;

  // EST-18 / J1-10 — THE ENGINEERING SCOPE the price is for, from the approved technical study it
  // rests on. The offer used to print its lines and its money and nothing of what was engineered.
  const heading = (label: string): void => { ensure(12); y += 2; text(label, left, { size: 10, bold: true }); y += 5; };
  if (technical) {
    heading('Technical basis');
    paragraph(`Approved technical study ${technical.reference} - ${technical.title} - on client input ${technical.inputRevision}${technical.approvedAt ? `, approved ${technical.approvedAt.slice(0, 10)}` : ''}.`);
    if (technical.scopeSummary.trim()) { heading('Scope of works'); paragraph(technical.scopeSummary); }
    if (technical.systems.length) {
      heading('Systems');
      for (const system of technical.systems) paragraph(`- ${system.name}${system.discipline ? ` (${system.discipline})` : ''}${system.designBasis ? `: ${system.designBasis}` : ''}`, 2);
    }
    y += 2;
  }

  const widths = { description: 90, quantity: 18, unit: 17, unitPrice: 28, net: 30 };
  const header = (): void => {
    pdf.setFillColor(35, 42, 55);
    pdf.rect(left, y - 4, right - left, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    text('Description', left + 2, { size: 8, bold: true });
    text('Qty', left + widths.description + widths.quantity - 2, { size: 8, bold: true, align: 'right' });
    text('Unit', left + widths.description + widths.quantity + widths.unit - 2, { size: 8, bold: true, align: 'right' });
    text('Unit price', left + widths.description + widths.quantity + widths.unit + widths.unitPrice - 2, { size: 8, bold: true, align: 'right' });
    text('Net', right - 2, { size: 8, bold: true, align: 'right' });
    pdf.setTextColor(25, 30, 40);
    y += 7;
  };
  header();
  for (const line of quotation.lines) {
    const description = pdf.splitTextToSize(line.description, widths.description - 4) as string[];
    const rowHeight = Math.max(7, description.length * 4 + 3);
    if (y + rowHeight > pageHeight - 28) { addPage(); header(); }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(description, left + 2, y);
    pdf.text(String(line.quantity), left + widths.description + widths.quantity - 2, y, { align: 'right' });
    pdf.text(line.unit || '-', left + widths.description + widths.quantity + widths.unit - 2, y, { align: 'right' });
    pdf.text(money(line.unitPrice, identity.currency), left + widths.description + widths.quantity + widths.unit + widths.unitPrice - 2, y, { align: 'right' });
    pdf.text(money(line.lineNet, identity.currency), right - 2, y, { align: 'right' });
    y += rowHeight;
    pdf.setDrawColor(225, 228, 233);
    pdf.line(left, y - 3, right, y - 3);
  }

  ensure(28);
  y += 2;
  for (const [label, value, bold] of [
    ['Subtotal', quotation.subtotal, false], ['VAT', quotation.vatTotal, false], ['Total', quotation.total, true],
  ] as Array<[string, number, boolean]>) {
    text(label, right - 55, { bold, align: 'left', size: bold ? 10 : 9 });
    text(money(value, identity.currency), right, { bold, align: 'right', size: bold ? 10 : 9 });
    y += 5;
  }

  // The offer's own exclusions and the study's, once each.
  const exclusions = [...(quotation.exclusions ?? []), ...(technical?.exclusions ?? [])]
    .filter((item, index, all) => item.trim() && all.findIndex((other) => other.trim().toLowerCase() === item.trim().toLowerCase()) === index);
  const sections: Array<[string, string]> = [
    ['Deviations from the specification', (technical?.deviations ?? []).map((d) => `- ${d.requirementRef ? `${d.requirementRef}: ` : ''}${d.description}${d.resolution ? ` - ${d.resolution}` : ''}`).join('\n')],
    ['Clarifications', (technical?.clarifications ?? []).map((c) => `- ${c.reference ? `${c.reference}: ` : ''}${c.question} - ${c.answer}`).join('\n')],
    ['Assumptions', (technical?.assumptions ?? []).map((item) => `- ${item}`).join('\n')],
    ['Exclusions', exclusions.map((item) => `- ${item}`).join('\n')],
    ['Payment conditions', quotation.paymentConditions || ''],
    ['Delivery terms', quotation.deliveryTerms || ''],
    ['Terms', quotation.terms || ''],
  ];
  for (const [label, value] of sections) {
    if (!value.trim()) continue;
    ensure(14);
    y += 3;
    text(label, left, { size: 9, bold: true });
    y += 4;
    paragraph(value);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 105, 115);
    pdf.text(`${quotation.quoteNumber} | Rev ${quotation.revision ?? 0} | Page ${page} of ${pages}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
  }

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${safeFilename(quotation.quoteNumber)}-rev-${quotation.revision ?? 0}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
