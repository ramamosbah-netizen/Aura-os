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

export type EvidenceCategory = 'progress' | 'defect' | 'material' | 'safety' | 'delay' | 'installation' | 'other';
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
}
export interface NewSiteEvidence {
  tenantId: string; companyId?: string | null; dailyReportId: string; projectId: string;
  fileId: string; capturedAt?: string | null; capturedBy?: string | null; location?: string | null; description?: string | null; category?: EvidenceCategory; hash?: string | null; createdBy?: string | null;
}
const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = ['progress', 'defect', 'material', 'safety', 'delay', 'installation', 'other'];
export function makeSiteEvidence(input: NewSiteEvidence): SiteEvidence {
  if (!input.fileId?.trim()) throw new Error('fileId is required');
  const category = input.category ?? 'progress';
  if (!EVIDENCE_CATEGORIES.includes(category)) throw new Error(`category must be one of: ${EVIDENCE_CATEGORIES.join(', ')}`);
  return { ...lineBase(input), fileId: input.fileId.trim(), capturedAt: input.capturedAt ?? null, capturedBy: input.capturedBy?.trim() || input.createdBy || null, location: input.location?.trim() || null, description: input.description?.trim() || null, category, hash: input.hash?.trim() || null };
}
