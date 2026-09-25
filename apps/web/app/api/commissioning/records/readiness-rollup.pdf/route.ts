import jsPDF from 'jspdf';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * THE COMMISSIONING READINESS ROLLUP, as a document (TC-11).
 *
 * It FETCHES the governed rollup — the workspace read the screen uses, and Quality's checklist
 * coverage through T&C — and prints it. It decides nothing: every state, every reason and every
 * owning domain is the readiness chain's own words, so the sheet cannot disagree with the screen it
 * was printed from. An UNKNOWN is printed as UNKNOWN with its reason, never as a pass.
 *
 * Access is the reader's own: the reads go out with their credentials, and a refusal comes back as
 * the refusal — there is no document for somebody the rollup itself would not show.
 */

interface Gate { id: string; label: string; state: string; reason: string; source: string }
interface SystemView {
  record: { code: string; title: string; system: string; projectName: string | null };
  commissioned: boolean;
  readiness: { gates: Gate[]; commissioningReady: boolean; blocking: string[] };
  checklist: { reference: string | null; revision: number } | null;
}
interface Workspace { systems: SystemView[] }
interface CoverageSystem {
  system: string; state: string; templateVersion: number | null;
  approved: { reference: string; revision: number } | null;
  inPreparation: { revision: number; status: string } | null;
}
interface Coverage { readable: boolean; systems: CoverageSystem[] }

const COVERAGE_STATE: Record<string, string> = {
  ready: 'approved checklist — every record bound',
  unbound: 'approved checklist — a record is not yet bound',
  no_approved_itp: 'NOT READY — no approved project checklist',
  no_template: 'NOT READY — no published template',
};

export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });

  let workspace: Workspace;
  let coverage: Coverage;
  try {
    const headers = await authHeader();
    const q = `projectId=${encodeURIComponent(projectId)}`;
    const [ws, cov] = await Promise.all([
      apiFetch(`${apiBase()}/api/v1/commissioning/records/workspace?${q}`, { headers, cache: 'no-store' }),
      apiFetch(`${apiBase()}/api/v1/commissioning/records/checklist-coverage?${q}`, { headers, cache: 'no-store' }),
    ]);
    if (!ws.ok) return Response.json(await ws.json().catch(() => ({})), { status: ws.status });
    if (!cov.ok) return Response.json(await cov.json().catch(() => ({})), { status: cov.status });
    workspace = (await ws.json()) as Workspace;
    coverage = (await cov.json()) as Coverage;
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
  const stateColour = (state: string): [number, number, number] =>
    state === 'READY' ? [21, 128, 61] : state === 'NOT_APPLICABLE' ? [90, 100, 110] : [180, 83, 9];

  const projectName = workspace.systems.find((s) => s.record.projectName)?.record.projectName ?? projectId;
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const ready = workspace.systems.filter((s) => s.readiness.commissioningReady).length;

  text('COMMISSIONING READINESS ROLLUP', left, { size: 14, bold: true });
  y += 6;
  text(`${projectName}   ·   generated ${generatedAt} UTC`, left, { size: 9, colour: [90, 100, 110] });
  y += 7;
  pdf.setFillColor(243, 246, 248);
  pdf.rect(left, y - 4, right - left, 11, 'F');
  const n = workspace.systems.length;
  text(`${ready} of ${n} ${n === 1 ? 'system' : 'systems'} COMMISSIONING READY`, left + 3, { size: 9.5, bold: true });
  y += 5;
  text('Every state and reason below is the readiness chain\'s own; a gate its owning domain could not answer reads UNKNOWN and blocks.',
    left + 3, { size: 7.6, colour: [90, 100, 110] });
  y += 11;

  for (const s of workspace.systems) {
    room(30);
    text(`${s.record.code} — ${s.record.title}`, left, { size: 10.5, bold: true });
    const open = s.readiness.blocking.length;
    text(s.readiness.commissioningReady ? 'COMMISSIONING READY' : `${open} ${open === 1 ? 'gate' : 'gates'} outstanding`, right - 50,
      { size: 9, bold: true, colour: s.readiness.commissioningReady ? [21, 128, 61] : [180, 83, 9] });
    y += 5;
    text(`System ${s.record.system.replace(/_/g, ' ')}   ·   ${s.checklist ? `tested against ${s.checklist.reference ?? 'the approved checklist'} rev ${s.checklist.revision}` : 'not bound to an approved checklist'}${s.commissioned ? '   ·   commissioned' : ''}`,
      left, { size: 8, colour: [90, 100, 110] });
    y += 5;
    for (const g of s.readiness.gates) {
      room(10);
      text(g.label, left + 2, { size: 8.3, bold: true });
      text(g.state.replace('_', ' '), left + 60, { size: 8.3, bold: true, colour: stateColour(g.state) });
      text(g.source, left + 92, { size: 7.6, colour: [110, 120, 130] });
      y += 3.8;
      const n = text(g.reason, left + 6, { size: 7.6, colour: [60, 66, 75], width: right - left - 8 });
      y += 3.4 * n + 1.6;
    }
    y += 4;
  }

  room(20);
  text('APPROVED CHECKLISTS — Quality', left, { size: 10, bold: true });
  y += 5;
  if (!coverage.readable) {
    text('Quality\'s checklists could not be read, so no system is shown as having one.', left, { size: 8.3, colour: [180, 83, 9] });
    y += 5;
  } else {
    for (const c of coverage.systems) {
      room(6);
      text(c.system.replace(/_/g, ' '), left + 2, { size: 8.3, bold: true });
      text(`${COVERAGE_STATE[c.state] ?? c.state}${c.approved ? `   ·   ${c.approved.reference} rev ${c.approved.revision}` : ''}${c.inPreparation ? `   ·   revision ${c.inPreparation.revision} ${c.inPreparation.status}` : ''}`,
        left + 48, { size: 8.3, colour: c.state === 'ready' ? [21, 128, 61] : c.state === 'unbound' ? [28, 33, 42] : [180, 83, 9] });
      y += 5;
    }
  }

  y = pdf.internal.pageSize.getHeight() - 10;
  text('A snapshot of the live rollup at the time above. The rollup on screen is authoritative; this sheet makes no readiness decision of its own.',
    left, { size: 7.2, bold: true, colour: [90, 100, 110] });

  const bytes = Buffer.from(pdf.output('arraybuffer'));
  const stamp = generatedAt.slice(0, 10);
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="commissioning-readiness-${stamp}.pdf"`,
    },
  });
}
