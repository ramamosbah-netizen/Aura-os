// Project delivery digest (slice P4) — the "today's status" the workspace overview shows, computed
// from the project's cross-module records. Kept a PURE function of the already-fetched area data so
// it is unit-testable and so slice P5 (the AI context assembler) can reuse the same derivation for
// the assistant's grounding rather than inventing a parallel one.

export type Tone = 'good' | 'bad' | 'accent' | 'muted';

export interface DigestKpi {
  area: string;
  icon: string;
  label: string;
  value: string;
  tone: Tone;
}

export interface Blocker {
  icon: string;
  text: string;
  severity: 'high' | 'med';
  href?: string;
}

export interface ProjectDigest {
  kpis: DigestKpi[];
  blockers: Blocker[];
  totalRecords: number;
}

type Row = Record<string, unknown>;

export interface AreaData {
  drawings: Row[];
  dailyReports: Row[];
  ncrs: Row[];
  permits: Row[];
  commissioning: Row[];
  documents: Row[];
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Derive the delivery digest from the project's area records. Pure — no I/O. */
export function computeDigest(d: AreaData): ProjectDigest {
  const drawingsApproved = d.drawings.filter((r) => /approved|issued|closed/i.test(s(r.status))).length;
  const ncrOpen = d.ncrs.filter((r) => s(r.status) !== 'closed');
  const ncrMajorOpen = ncrOpen.filter((r) => /major|critical|high/i.test(s(r.severity)));
  const commissioned = d.commissioning.filter((r) => s(r.status) === 'commissioned').length;
  const commissioningFailed = d.commissioning.filter((r) => /failed/i.test(s(r.status)));
  const today = new Date().toISOString().slice(0, 10);
  const permitsExpired = d.permits.filter((r) => s(r.validTo) && s(r.validTo).slice(0, 10) < today && s(r.status) !== 'closed');
  const permitsActive = d.permits.filter((r) => /approved|active|open/i.test(s(r.status))).length;
  const reportsAwaiting = d.dailyReports.filter((r) => /submitted|under_review/i.test(s(r.status)));
  const drawingsRejected = d.drawings.filter((r) => /rejected/i.test(s(r.status)));

  const kpis: DigestKpi[] = [
    { area: 'engineering', icon: '📐', label: 'Drawings approved', value: `${drawingsApproved}/${d.drawings.length}`, tone: 'accent' },
    { area: 'quality', icon: '✅', label: 'Open NCRs', value: String(ncrOpen.length), tone: ncrOpen.length ? 'bad' : 'good' },
    { area: 'commissioning', icon: '🧪', label: 'Systems commissioned', value: `${commissioned}/${d.commissioning.length}`, tone: 'accent' },
    { area: 'hse', icon: '🦺', label: 'Active permits', value: String(permitsActive), tone: permitsExpired.length ? 'bad' : 'good' },
    { area: 'site', icon: '🏗️', label: 'Reports awaiting review', value: String(reportsAwaiting.length), tone: reportsAwaiting.length ? 'accent' : 'good' },
    { area: 'documents', icon: '📄', label: 'Documents', value: String(d.documents.length), tone: 'muted' },
  ];

  const blockers: Blocker[] = [];
  for (const r of ncrMajorOpen) {
    blockers.push({ icon: '✅', severity: 'high', text: `NCR ${s(r.ncrNumber) || 'open'} (${s(r.severity)}) not yet closed`, href: r.id ? `/quality/ncrs/${s(r.id)}` : undefined });
  }
  for (const r of permitsExpired) {
    blockers.push({ icon: '🦺', severity: 'high', text: `Permit (${s(r.permitType)}) expired ${s(r.validTo).slice(0, 10)}`, href: undefined });
  }
  for (const r of commissioningFailed) {
    blockers.push({ icon: '🧪', severity: 'high', text: `System ${s(r.code) || s(r.system)} failed commissioning (${n(r.pointsPassed)}/${n(r.pointsTotal)} points)`, href: r.id ? `/commissioning/${s(r.id)}` : undefined });
  }
  for (const r of drawingsRejected) {
    blockers.push({ icon: '📐', severity: 'med', text: `Drawing ${s(r.code)} rejected — awaiting new revision`, href: r.id ? `/engineering/drawings/${s(r.id)}` : undefined });
  }
  for (const r of reportsAwaiting) {
    blockers.push({ icon: '🏗️', severity: 'med', text: `Daily report ${s(r.date).slice(0, 10)} awaiting review`, href: r.id ? `/site/execution/${s(r.id)}` : undefined });
  }

  // High severity first, then medium; keep the list actionable.
  blockers.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));

  const totalRecords = d.drawings.length + d.dailyReports.length + d.ncrs.length + d.permits.length + d.commissioning.length + d.documents.length;
  return { kpis, blockers, totalRecords };
}
