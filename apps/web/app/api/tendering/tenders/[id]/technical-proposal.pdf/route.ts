import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface TechnicalProposalSource {
  tender: { id: string; title: string; reference: string | null; accountName: string | null; submissionDeadline: string | null };
  study: {
    id: string; revisionNo: number; title: string; inputRevision: string; reviewedAt: string | null;
    scopeSummary: string;
    systems: Array<{ discipline: string; name: string; designBasis: string; interfaces: string[] }>;
    requirements: Array<{ category: string; statement: string; acceptanceCriteria: string; sourceRef: string; compliance: string; response: string }>;
    surveyFindings: Array<{ area: string; observation: string; impact: string }>;
    clarifications: Array<{ question: string; answer: string; status: string; reference: string }>;
    deviations: Array<{ requirementRef: string; description: string; impact: string; proposedResolution: string; status: string }>;
    assumptions: string[]; exclusions: string[];
    evidence: Array<{ title: string; kind: string; revision: string }>;
  };
  commercialReference: { quotationId: string; quoteNumber: string; revision: number };
}

interface DocumentIdentity {
  configured: boolean; name: string; legalName: string; trn: string; address: string;
  phone: string; email: string; website: string;
}

const safeFilename = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'tender';
const label = (value: string): string => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = await authHeader();
  const sourceResponse = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/technical-proposal`, {
    headers, cache: 'no-store',
  });
  if (!sourceResponse.ok) {
    return Response.json(await sourceResponse.json().catch(() => ({ message: 'Technical proposal unavailable' })), { status: sourceResponse.status });
  }
  const source = await sourceResponse.json() as TechnicalProposalSource;
  const identityResponse = await apiFetch(
    `${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(source.commercialReference.quotationId)}/document-identity`,
    { headers, cache: 'no-store' },
  );
  if (!identityResponse.ok) {
    return Response.json(await identityResponse.json().catch(() => ({ message: 'Company identity unavailable' })), { status: identityResponse.status });
  }
  const identity = await identityResponse.json() as DocumentIdentity;
  if (!identity.configured) {
    return Response.json({ message: 'Configure the legal company name before generating customer documents.' }, { status: 409 });
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const left = 15;
  const right = width - 15;
  let y = 15;

  const page = (): void => {
    pdf.addPage();
    y = 14;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(28, 33, 42);
    pdf.text(identity.legalName || identity.name, left, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(22, 78, 99);
    pdf.text('TECHNICAL PROPOSAL · CONTINUED', right, y, { align: 'right' });
    y += 4; pdf.setDrawColor(190, 205, 213); pdf.line(left, y, right, y); y += 8;
  };
  const ensure = (needed: number): void => { if (y + needed > height - 19) page(); };
  const line = (value: string, x = left, options: { size?: number; bold?: boolean; right?: boolean; color?: [number, number, number] } = {}): void => {
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    pdf.setFontSize(options.size ?? 8.5);
    pdf.setTextColor(...(options.color ?? [28, 33, 42]));
    pdf.text(value, x, y, { align: options.right ? 'right' : 'left' });
  };
  const paragraph = (value: string, indent = 0): void => {
    const rows = pdf.splitTextToSize(value || '-', right - left - indent) as string[];
    ensure(rows.length * 4 + 2);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(28, 33, 42);
    pdf.text(rows, left + indent, y); y += rows.length * 4 + 2;
  };
  const heading = (value: string): void => {
    ensure(11); y += 4; line(value, left, { size: 11, bold: true, color: [22, 78, 99] }); y += 5;
    pdf.setDrawColor(190, 205, 213); pdf.line(left, y, right, y); y += 5;
  };
  const bullets = (values: string[]): void => {
    if (values.length === 0) { paragraph('None recorded.'); return; }
    for (const value of values) paragraph(`• ${value}`, 2);
  };
  const record = (title: string, rows: Array<[string, string]>): void => {
    const estimated = 7 + rows.reduce((sum, [, value]) => sum + Math.max(4, (pdf.splitTextToSize(value || '-', 130) as string[]).length * 4), 0);
    ensure(Math.min(estimated, 45));
    line(title, left, { bold: true, size: 9 }); y += 4;
    for (const [key, value] of rows) {
      const wrapped = pdf.splitTextToSize(value || '-', 130) as string[];
      ensure(wrapped.length * 4 + 2);
      line(`${key}:`, left + 2, { bold: true, size: 8 });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(28, 33, 42);
      pdf.text(wrapped, left + 36, y);
      y += Math.max(4, wrapped.length * 4);
    }
    y += 3;
  };

  line(identity.legalName || identity.name, left, { size: 15, bold: true });
  line('TECHNICAL PROPOSAL', right, { size: 13, bold: true, right: true, color: [22, 78, 99] });
  y += 6;
  line([identity.address, identity.trn ? `TRN ${identity.trn}` : '', identity.email, identity.phone].filter(Boolean).join(' | '), left, { size: 7.5 });
  line(`${source.commercialReference.quoteNumber} · Rev ${source.commercialReference.revision}`, right, { size: 8, bold: true, right: true });
  y += 5; pdf.setDrawColor(40, 48, 58); pdf.line(left, y, right, y); y += 7;

  record(source.tender.title, [
    ['Client', source.tender.accountName || '-'],
    ['Tender reference', source.tender.reference || '-'],
    ['Technical study', `${source.study.title} · S-${String(source.study.revisionNo).padStart(3, '0')} · input ${source.study.inputRevision}`],
    ['Commercial reference', `${source.commercialReference.quoteNumber} · Rev ${source.commercialReference.revision}`],
    ['Approved', source.study.reviewedAt ? source.study.reviewedAt.slice(0, 10) : '-'],
  ]);

  heading('Scope summary'); paragraph(source.study.scopeSummary);
  heading('Systems and design basis');
  for (const system of source.study.systems) record(`${system.discipline} · ${system.name}`, [
    ['Design basis', system.designBasis], ['Interfaces', system.interfaces.join(', ') || 'None recorded'],
  ]);

  heading('Requirements and compliance');
  for (const requirement of source.study.requirements) record(`${label(requirement.compliance)} · ${label(requirement.category)}`, [
    ['Requirement', requirement.statement],
    ['Acceptance criteria', requirement.acceptanceCriteria],
    ['Response', requirement.response],
    ['Source', requirement.sourceRef],
  ]);

  if (source.study.surveyFindings.length) {
    heading('Site survey findings');
    for (const finding of source.study.surveyFindings) record(finding.area, [['Observation', finding.observation], ['Impact', finding.impact]]);
  }
  if (source.study.clarifications.length) {
    heading('Clarifications');
    for (const clarification of source.study.clarifications) record(`${label(clarification.status)} · ${clarification.reference || 'No reference'}`, [
      ['Question', clarification.question], ['Answer', clarification.answer || 'No answer recorded'],
    ]);
  }
  if (source.study.deviations.length) {
    heading('Deviations');
    for (const deviation of source.study.deviations) record(`${label(deviation.status)} · ${deviation.requirementRef || 'Requirement'}`, [
      ['Deviation', deviation.description], ['Impact', deviation.impact], ['Resolution', deviation.proposedResolution],
    ]);
  }
  heading('Assumptions'); bullets(source.study.assumptions);
  heading('Exclusions'); bullets(source.study.exclusions);
  heading('Evidence register');
  if (source.study.evidence.length === 0) paragraph('No evidence references recorded.');
  else for (const evidence of source.study.evidence) record(evidence.title, [['Type', label(evidence.kind)], ['Revision', evidence.revision || '-']]);

  ensure(14); y += 4;
  paragraph(`Commercial prices and conditions are issued separately under ${source.commercialReference.quoteNumber} Rev ${source.commercialReference.revision}.`);

  const pages = pdf.getNumberOfPages();
  for (let current = 1; current <= pages; current += 1) {
    pdf.setPage(current); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(100, 105, 115);
    pdf.text(`${source.tender.reference || source.tender.title} · Technical Study S-${String(source.study.revisionNo).padStart(3, '0')} · Page ${current} of ${pages}`, width / 2, height - 8, { align: 'center' });
  }

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${safeFilename(source.tender.reference || source.tender.title)}-technical-proposal-S${source.study.revisionNo}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
