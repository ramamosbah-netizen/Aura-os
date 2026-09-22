import { type SignedReportContent, signatureCoversContent } from './daily-report';
import { randomUUID } from 'node:crypto';
import { moneyNumber as r2 } from '@aura/shared';

/**
 * The typed line-items of a Site Daily Report (G-34). Each belongs to one report (`dailyReportId`)
 * and captures WHO / WHAT / HOW MUCH — not a bare count. They are the auditable content of the site
 * diary: manpower by trade, plant by item, installation progress against the BOQ, delays, and photo
 * evidence (a reference to object storage + metadata + hash, never the blob itself).
 */

interface LineBase {
  id: string;
  tenantId: string;
  companyId: string | null;
  dailyReportId: string;
  projectId: string;
  createdBy: string | null;
  createdAt: string;
}

const lineBase = (input: { tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string; createdBy?: string | null }): LineBase => ({
  id: randomUUID(),
  tenantId: input.tenantId,
  companyId: input.companyId ?? null,
  dailyReportId: input.dailyReportId,
  projectId: input.projectId,
  createdBy: input.createdBy ?? null,
  createdAt: new Date().toISOString(),
});


// ── Labour ───────────────────────────────────────────────────────────────────

export interface SiteLabourEntry extends LineBase {
  trade: string;
  contractor: string | null;
  headcount: number;
  hours: number;
  manHours: number;
  notes: string | null;
}
export interface NewSiteLabourEntry {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  trade: string; contractor?: string | null; headcount: number; hours: number; notes?: string | null; createdBy?: string | null;
}
export function makeSiteLabourEntry(input: NewSiteLabourEntry): SiteLabourEntry {
  if (!input.trade?.trim()) throw new Error('trade is required');
  const headcount = Math.max(0, Number(input.headcount) || 0);
  const hours = Math.max(0, Number(input.hours) || 0);
  return { ...lineBase(input), trade: input.trade.trim(), contractor: input.contractor?.trim() || null, headcount, hours, manHours: r2(headcount * hours), notes: input.notes?.trim() || null };
}

// ── Plant / equipment ──────────────────────────────────────────────────────────

export type PlantStatus = 'operational' | 'idle' | 'breakdown';
export interface SitePlantEntry extends LineBase {
  equipmentType: string;
  equipmentId: string | null;
  quantity: number;
  operatingHours: number;
  status: PlantStatus;
  notes: string | null;
}
export interface NewSitePlantEntry {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  equipmentType: string; equipmentId?: string | null; quantity?: number; operatingHours?: number; status?: PlantStatus; notes?: string | null; createdBy?: string | null;
}
const PLANT_STATUSES: readonly PlantStatus[] = ['operational', 'idle', 'breakdown'];
export function makeSitePlantEntry(input: NewSitePlantEntry): SitePlantEntry {
  if (!input.equipmentType?.trim()) throw new Error('equipmentType is required');
  const status = input.status ?? 'operational';
  if (!PLANT_STATUSES.includes(status)) throw new Error(`status must be one of: ${PLANT_STATUSES.join(', ')}`);
  return { ...lineBase(input), equipmentType: input.equipmentType.trim(), equipmentId: input.equipmentId?.trim() || null, quantity: Math.max(0, Number(input.quantity) || 1), operatingHours: Math.max(0, Number(input.operatingHours) || 0), status, notes: input.notes?.trim() || null };
}

// ── Installation progress (linked to BOQ / WBS activity) ─────────────────────────

export interface SiteProgressEntry extends LineBase {
  /** WBS activity + BOQ item this progress is booked against (either may be null). */
  activityId: string | null;
  boqItemId: string | null;
  description: string;
  plannedQty: number;
  installedQty: number;
  unit: string | null;
  /** installedQty / plannedQty × 100 (0 when plannedQty is 0). */
  progressPct: number;
  location: string | null;
  notes: string | null;
}
export interface NewSiteProgressEntry {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  activityId?: string | null; boqItemId?: string | null; description: string; plannedQty?: number; installedQty: number; unit?: string | null; location?: string | null; notes?: string | null; createdBy?: string | null;
}
export function makeSiteProgressEntry(input: NewSiteProgressEntry): SiteProgressEntry {
  if (!input.description?.trim()) throw new Error('description is required');
  const planned = Math.max(0, Number(input.plannedQty) || 0);
  const installed = Math.max(0, Number(input.installedQty) || 0);
  return {
    ...lineBase(input),
    activityId: input.activityId?.trim() || null,
    boqItemId: input.boqItemId?.trim() || null,
    description: input.description.trim(),
    plannedQty: planned,
    installedQty: installed,
    unit: input.unit?.trim() || null,
    progressPct: planned > 0 ? r2((installed / planned) * 100) : 0,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

// ── Delay ────────────────────────────────────────────────────────────────────

export type DelayCategory = 'weather' | 'material' | 'access' | 'design' | 'labour' | 'plant' | 'client' | 'other';
export interface SiteDelayEntry extends LineBase {
  category: DelayCategory;
  description: string;
  durationHours: number;
  responsibleParty: string | null;
  impact: string | null;
  mitigation: string | null;
}
export interface NewSiteDelayEntry {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  category: DelayCategory; description: string; durationHours?: number; responsibleParty?: string | null; impact?: string | null; mitigation?: string | null; createdBy?: string | null;
}
const DELAY_CATEGORIES: readonly DelayCategory[] = ['weather', 'material', 'access', 'design', 'labour', 'plant', 'client', 'other'];
export function makeSiteDelayEntry(input: NewSiteDelayEntry): SiteDelayEntry {
  if (!input.description?.trim()) throw new Error('description is required');
  if (!DELAY_CATEGORIES.includes(input.category)) throw new Error(`category must be one of: ${DELAY_CATEGORIES.join(', ')}`);
  return { ...lineBase(input), category: input.category, description: input.description.trim(), durationHours: Math.max(0, Number(input.durationHours) || 0), responsibleParty: input.responsibleParty?.trim() || null, impact: input.impact?.trim() || null, mitigation: input.mitigation?.trim() || null };
}

// ── Evidence (photo / document reference) ────────────────────────────────────────

/**
 * A SIGNATURE IS ITS OWN CATEGORY, not a photograph with a suggestive description.
 *
 * The printable report picked the signature out with `/signature|sign-off/i` against the
 * DESCRIPTION — free text, typed by whoever uploaded it — while the form filed photographs and
 * the signature alike under `progress`. So a progress photo described “riser sign-off” was
 * printed AS THE SIGNATURE on a controlled document, and the real one dropped to a photo row.
 * Selection now asks what the file IS.
 */
export type EvidenceCategory = 'progress' | 'defect' | 'material' | 'safety' | 'delay' | 'installation' | 'signature' | 'other';
export interface SiteEvidence extends LineBase {
  /** Reference to the file in object storage — the blob is NEVER stored on the report. */
  fileId: string;
  capturedAt: string | null;
  capturedBy: string | null;
  location: string | null;
  description: string | null;
  category: EvidenceCategory;
  /** Content hash for tamper-evidence / dedup. */
  hash: string | null;
  /**
   * WHO SIGNED — which is not `capturedBy`, and never derived from it.
   *
   * `capturedBy` falls back to `createdBy`, the account that uploaded the file. The form calls
   * the pad “Supervisor Sign-off” and is filled in at the tablet by whoever is holding it, so
   * the printed sheet read “Signed by <the site engineer>” for a signature the FOREMAN gave.
   * That is the recorder being credited with somebody else's act — the same conflation ENG-04
   * settled for an external approval and HO-ACK-01 for a transmittal receipt.
   *
   * A label, not an id: the person signing a site diary need not hold an AURA account at all.
   * Null on any non-signature evidence, and required on a signature.
   */
  signedBy: string | null;
  /**
   * The report content this signature was given for (see `dailyReportContentHash`). Null on a
   * signature taken before this existed, which reads as `unverifiable` and never as a mismatch.
   */
  signedContentHash: string | null;
}
export interface NewSiteEvidence {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  fileId: string; capturedAt?: string | null; capturedBy?: string | null; location?: string | null; description?: string | null; category?: EvidenceCategory; hash?: string | null; createdBy?: string | null;
  signedBy?: string | null; signedContentHash?: string | null;
}
const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = ['progress', 'defect', 'material', 'safety', 'delay', 'installation', 'signature', 'other'];
export function makeSiteEvidence(input: NewSiteEvidence): SiteEvidence {
  if (!input.fileId?.trim()) throw new Error('fileId is required');
  const category = input.category ?? 'progress';
  if (!EVIDENCE_CATEGORIES.includes(category)) throw new Error(`category must be one of: ${EVIDENCE_CATEGORIES.join(', ')}`);
  // A SIGNATURE MUST NAME ITS SIGNER. Without this the field would simply be absent on most
  // rows and every surface would fall back to `capturedBy` again — which is the defect, not a
  // degraded version of it. Refusing here is what makes `signedBy` mean something wherever it
  // is read.
  const signedBy = input.signedBy?.trim() || null;
  if (category === 'signature' && !signedBy) {
    throw new Error('validation: a signature requires the name of the person who signed it — whoever uploaded it is not therefore its signatory');
  }
  // …and only a signature may carry one. A photograph with a signatory would be a second place
  // for a surface to look for one.
  if (category !== 'signature' && signedBy) {
    throw new Error(`validation: only a signature may name a signatory; this evidence is filed as ${category}`);
  }
  return { ...lineBase(input), fileId: input.fileId.trim(), capturedAt: input.capturedAt ?? null, capturedBy: input.capturedBy?.trim() || input.createdBy || null, location: input.location?.trim() || null, description: input.description?.trim() || null, category, hash: input.hash?.trim() || null, signedBy, signedContentHash: input.signedContentHash?.trim() || null };
}

/**
 * THE SIGNATURE THIS REPORT CARRIES, AND WHETHER IT STILL COVERS THE TEXT.
 *
 * Resolved in ONE place because two consumers need the same answer: the printable controlled
 * sheet and anything else that reports on the day. The sheet lives in the web app, which cannot
 * import this module, so it must be told rather than left to re-derive the selection rule and the
 * content hash — two calculations of one question is the drift this avoids.
 *
 * THE LAST SIGNATURE WINS. A day corrected after rejection can be signed again, and the later
 * signature is the one that covers the current text; printing the first would show a superseded
 * signature on a sheet that has moved past it. The earlier rows are not deleted — they stay as
 * the record that the day was signed once and then changed.
 */
export interface ResolvedReportSignature {
  evidence: SiteEvidence;
  /**
   * `current` — given for exactly this text. `superseded` — given for an earlier version, which
   * the sheet must SAY rather than hide. `unverifiable` — taken before the report recorded what a
   * signature covers; a real signature that nobody checked, and never to be rendered as a
   * mismatch.
   */
  coverage: 'current' | 'superseded' | 'unverifiable';
}

export function resolveReportSignature(
  evidence: readonly SiteEvidence[],
  report: SignedReportContent,
): ResolvedReportSignature | null {
  const signatures = evidence.filter((e) => e.category === 'signature');
  const latest = signatures.length ? signatures[signatures.length - 1] : null;
  if (!latest) return null;
  return { evidence: latest, coverage: signatureCoversContent(latest.signedContentHash, report) };
}
