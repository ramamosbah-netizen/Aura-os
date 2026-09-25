import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * THE DEFECT AND CORRECTIVE-ACTION REGISTER, as a document (TC-08).
 *
 * It FETCHES the governed register — each defect joined to the evidence it answers — and prints it. It
 * decides nothing: whether a defect was routed, corrected, retested, closed or escalated, and what
 * Quality decided, are the records' own facts in their own words. A Quality decision that could not be
 * read is printed as unread, never as "none".
 *
 * Access is the reader's own: the read goes out with their credentials, and a refusal comes back as one.
 */

interface Defect {
  id: string; systemCode: string | null; systemTitle: string | null; description: string; severity: string; status: string;
  raisedBy: string | null; raisedAt: string;
  point: { pointNo: string; latestResult: string; runs: number } | null;
  failingRun: { runNo: number; actual: string | null; remarks: string | null } | null;
  routing: { to: string; by: string | null; at: string | null; reason: string | null } | null;
  correction: { action: string; reference: string | null; by: string | null; at: string | null } | null;
  closure: { by: string | null; at: string | null; resolution: string | null } | null;
  escalated: boolean;
  quality: { status: string; ncrNumber: string | null; reason: string | null; decidedBy: string | null } | null;
}
interface Register { projectName: string | null; qualityReadable: boolean; defects: Defect[] }

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });

  let data: Register;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/defect-register?projectId=${encodeURIComponent(projectId)}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
    data = (await res.json()) as Register;
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const left = 14;
  const right = pdf.internal.pageSize.getWidth() - 14;
  const bottom = pdf.internal.pageSize.getHeight() - 18;
  let y = 18;
  const text = (value: string, x: number, opts: { size?: number; bold?: boolean; colour?: [number, number, number]; width?: number } = {}) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 8.5);
    const [r, g, b] = opts.colour ?? [28, 33, 42];
    pdf.setTextColor(r, g, b);
    const lines = opts.width ? (pdf.splitTextToSize(value, opts.width) as string[]) : [value];
    pdf.text(lines, x, y);
    return lines.length;
  };
  const room = (needed: number) => { if (y + needed > bottom) { pdf.addPage(); y = 18; } };
  const line = (label: string, value: string, colour?: [number, number, number]) => {
    room(6);
    text(label, left + 4, { size: 7.8, bold: true, colour: [90, 100, 110] });
    const n = text(value, left + 34, { size: 8, colour, width: right - left - 36 });
    y += 3.6 * n + 0.8;
  };

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const open = data.defects.filter((d) => d.status !== 'closed').length;
  text('DEFECT AND CORRECTIVE-ACTION REGISTER', left, { size: 13.5, bold: true });
  y += 6;
  text(`${data.projectName ?? projectId}   ·   generated ${generatedAt} UTC`, left, { size: 9, colour: [90, 100, 110] });
  y += 7;
  pdf.setFillColor(243, 246, 248);
  pdf.rect(left, y - 4, right - left, 11, 'F');
  text(`${data.defects.length} ${data.defects.length === 1 ? 'defect' : 'defects'}, ${open} open`, left + 3, { size: 9.5, bold: true });
  y += 5;
  text('Testing & Commissioning closes a defect; a design correction is the engineer\'s; a non-conformance is Quality\'s to raise.',
    left + 3, { size: 7.6, colour: [90, 100, 110] });
  y += 11;

  for (const d of data.defects) {
    room(24);
    text(`${d.systemCode ?? 'System'} — ${d.description}`, left, { size: 10, bold: true, width: right - left - 40 });
    text(d.status === 'closed' ? 'CLOSED' : 'OPEN', right - 20, { size: 9, bold: true, colour: d.status === 'closed' ? [21, 128, 61] : [180, 83, 9] });
    y += 5.5;
    line('Raised', `${d.severity} · by ${d.raisedBy ?? 'unrecorded'} on ${day(d.raisedAt)}${d.systemTitle ? ` · ${d.systemTitle}` : ''}`);
    if (d.point) {
      line('Evidence', `test point ${d.point.pointNo}${d.failingRun ? `, run ${d.failingRun.runNo} failed${d.failingRun.actual ? `: ${d.failingRun.actual}` : ''}${d.failingRun.remarks ? ` — ${d.failingRun.remarks}` : ''}` : ''}`);
    } else {
      line('Evidence', 'raised outside testing — no test point');
    }
    line('Routing', d.routing ? `to ${d.routing.to} by ${d.routing.by ?? '—'} on ${day(d.routing.at)} — ${d.routing.reason ?? ''}` : 'not routed to Engineering');
    if (d.routing) {
      line('Correction', d.correction ? `${d.correction.action}${d.correction.reference ? ` (${d.correction.reference})` : ''} — by ${d.correction.by ?? '—'} on ${day(d.correction.at)}` : 'awaiting the engineer\'s corrective action',
        d.correction ? undefined : [180, 83, 9]);
    }
    if (d.point) line('Retest', `${d.point.pointNo} latest result ${d.point.latestResult.toUpperCase()} after ${d.point.runs} ${d.point.runs === 1 ? 'run' : 'runs'}`,
      d.point.latestResult === 'pass' ? [21, 128, 61] : [180, 83, 9]);
    line('Closure', d.closure ? `closed by ${d.closure.by ?? '—'} on ${day(d.closure.at)} — ${d.closure.resolution ?? ''}` : 'open');
    line('Quality', !d.escalated ? 'not escalated'
      : !data.qualityReadable ? 'escalated — Quality could not be read, so its decision is not printed'
      : d.quality?.status === 'ncr_raised' ? `escalated — Quality raised ${d.quality.ncrNumber ?? 'an NCR'}${d.quality.decidedBy ? ` (${d.quality.decidedBy})` : ''}`
      : d.quality?.status === 'not_nonconformance' ? `escalated — not a non-conformance: ${d.quality.reason ?? ''}${d.quality.decidedBy ? ` (${d.quality.decidedBy})` : ''}`
      : 'escalated — awaiting Quality\'s decision');
    y += 3;
  }

  y = pdf.internal.pageSize.getHeight() - 10;
  text('Printed from the live register at the time above; the records are authoritative. This sheet decides nothing of its own.',
    left, { size: 7.2, bold: true, colour: [90, 100, 110] });

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="defect-register-${generatedAt.slice(0, 10)}.pdf"`,
    },
  });
}
