import { randomUUID } from 'node:crypto';
import { ELV_SYSTEMS, type ElvSystem } from '@aura/shared';
import type { InspectionPointType, ItpPoint } from './itp';

/**
 * THE TENANT LIBRARY OF SYSTEM TEMPLATES — layer 1 of the approved checklist.
 *
 * A reusable, versioned set of test points and acceptance criteria for ONE canonical ELV system.
 * Quality writes it; nobody on a project approves anything by writing it — a template is not a
 * project approval. A project adopts a PUBLISHED version into its own ITP revision, which Quality then
 * adapts and approves (see system-itp.ts).
 *
 * Publishing freezes a version: a correction is the next version, and a project that adopted the
 * earlier one keeps exactly what it adopted.
 *
 * THE PRODUCT SHIPS NO TEMPLATES. Test points and criteria are engineering content with a technical
 * owner; inventing them for every system to make a screen look complete would be the fabrication
 * this rule exists to refuse. A system with no published template reads "not ready".
 */
export type ItpTemplateStatus = 'draft' | 'published' | 'retired';

export interface ChecklistPointInput {
  code: string;
  activity: string;
  method?: string | null;
  acceptanceCriteria: string;
  mandatory?: boolean;
  pointType?: InspectionPointType;
}

export interface ItpTemplate {
  id: string;
  tenantId: string;
  companyId: string | null;
  system: ElvSystem;
  version: number;
  title: string;
  status: ItpTemplateStatus;
  points: ItpPoint[];
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  retiredBy: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const POINT_TYPES: readonly InspectionPointType[] = ['hold', 'witness', 'review', 'surveillance'];

/** A system checklist's points, as Quality writes them: code, activity, criterion, and whether PASS needs it. */
export function checklistPoints(input: ChecklistPointInput[] | undefined | null): ItpPoint[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('validation: a checklist needs at least one test point');
  }
  const seen = new Set<string>();
  return input.map((p, i) => {
    const code = typeof p?.code === 'string' ? p.code.trim() : '';
    const activity = typeof p?.activity === 'string' ? p.activity.trim() : '';
    const criterion = typeof p?.acceptanceCriteria === 'string' ? p.acceptanceCriteria.trim() : '';
    if (!code) throw new Error(`validation: point ${i + 1} requires a code`);
    if (!activity) throw new Error(`validation: point ${code} requires an activity`);
    if (!criterion) {
      throw new Error(`validation: point ${code} requires an acceptance criterion — a test with no criterion cannot be passed or failed`);
    }
    const key = code.toLowerCase();
    if (seen.has(key)) throw new Error(`validation: duplicate point code ${code}`);
    seen.add(key);
    const pointType = p.pointType ?? 'witness';
    if (!POINT_TYPES.includes(pointType)) throw new Error(`validation: pointType must be one of: ${POINT_TYPES.join(', ')}`);
    return {
      code,
      activity,
      method: typeof p.method === 'string' && p.method.trim() ? p.method.trim() : null,
      acceptanceCriteria: criterion,
      mandatory: p.mandatory !== false,
      pointType,
      result: 'pending' as const,
    };
  });
}

/** A template names a canonical system — never `other`, never free text. */
export function templateSystem(system: unknown): ElvSystem {
  if (typeof system !== 'string' || !(ELV_SYSTEMS as readonly string[]).includes(system)) {
    throw new Error(`validation: system must be one of the canonical ELV systems (${ELV_SYSTEMS.filter((s) => s !== 'other').join(', ')})`);
  }
  if (system === 'other') throw new Error("validation: a template must name its system — 'other' names none");
  return system as ElvSystem;
}

export function makeItpTemplate(input: {
  tenantId: string;
  companyId?: string | null;
  system: unknown;
  version: number;
  title: string;
  points: ChecklistPointInput[];
  createdBy?: string | null;
}): ItpTemplate {
  const system = templateSystem(input.system);
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error('validation: version must be a positive integer');
  if (!input.title?.trim()) throw new Error('validation: a template requires a title');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    system,
    version: input.version,
    title: input.title.trim(),
    status: 'draft',
    points: checklistPoints(input.points),
    createdBy: input.createdBy ?? null,
    publishedBy: null,
    publishedAt: null,
    retiredBy: null,
    retiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function editTemplateDraft(t: ItpTemplate, patch: { title?: string; points?: ChecklistPointInput[] }): ItpTemplate {
  if (t.status !== 'draft') {
    throw new Error(`ITP template ${t.system} v${t.version} is immutable once published — a change is the next version`);
  }
  return {
    ...t,
    title: patch.title !== undefined ? (patch.title.trim() || t.title) : t.title,
    points: patch.points !== undefined ? checklistPoints(patch.points) : t.points,
    updatedAt: new Date().toISOString(),
  };
}

export function publishTemplate(t: ItpTemplate, actorId: string | null): ItpTemplate {
  if (t.status !== 'draft') throw new Error(`ITP template ${t.system} v${t.version} can only be published from draft — it is ${t.status}`);
  if (!actorId) throw new Error('validation: publishing a template requires an authenticated person');
  const now = new Date().toISOString();
  return { ...t, status: 'published', publishedBy: actorId, publishedAt: now, updatedAt: now };
}

export function retireTemplate(t: ItpTemplate, actorId: string | null): ItpTemplate {
  if (t.status !== 'published') throw new Error(`ITP template ${t.system} v${t.version} can only be retired once published — it is ${t.status}`);
  if (!actorId) throw new Error('validation: retiring a template requires an authenticated person');
  const now = new Date().toISOString();
  return { ...t, status: 'retired', retiredBy: actorId, retiredAt: now, updatedAt: now };
}

/** Tenant coverage: every canonical system, and the version Quality has published for it — or none. */
export function templateCoverage(templates: ItpTemplate[]): Array<{ system: ElvSystem; publishedVersion: number | null; templateId: string | null }> {
  return ELV_SYSTEMS.filter((s): s is ElvSystem => s !== 'other').map((system) => {
    const latest = templates
      .filter((t) => t.system === system && t.status === 'published')
      .sort((a, b) => b.version - a.version)[0];
    return { system, publishedVersion: latest?.version ?? null, templateId: latest?.id ?? null };
  });
}
