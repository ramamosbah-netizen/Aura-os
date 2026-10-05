import { randomUUID } from 'node:crypto';
import type { ElvSystem } from '@aura/shared';

/**
 * Inspection & Test Plan (ITP) — the QA plan defining, per work activity, the inspection points
 * the contractor must pass (Hold / Witness / Review / Surveillance) and their acceptance criteria.
 * Distinct from a one-off inspection request: the ITP is the *plan*; results are signed off against
 * its points. Lifecycle: draft → active → closed (closeable only once every point is resolved).
 */
export type ItpStatus = 'draft' | 'active' | 'closed' | 'submitted' | 'approved' | 'superseded';
export type InspectionPointType = 'hold' | 'witness' | 'review' | 'surveillance';
export type PointResult = 'pending' | 'passed' | 'failed';

/**
 * TWO KINDS OF PLAN, NEVER ONE BEHAVIOUR.
 *
 * `installation_inspection` — today's plan: hold and witness points QA/QC executes on site, a
 * free-text discipline, draft → active → closed, and its results gate WBS completion.
 *
 * `system_commissioning` — the approved checklist of ONE canonical ELV system on a project (TC-08,
 * TC-09): a governed revision prepared from a tenant template, approved by a QA/QC person other than
 * its preparer, frozen once approved (draft → submitted → approved → superseded). Its points are
 * executed on the commissioning record bound to it, never on the plan.
 */
export type ItpKind = 'installation_inspection' | 'system_commissioning';

export interface ItpPoint {
  activity: string;
  pointType: InspectionPointType;
  acceptanceCriteria: string;
  result: PointResult;
  /** System checklist only: the point's stable code, how it is tested, and whether PASS needs it. */
  code?: string;
  method?: string | null;
  mandatory?: boolean;
  /**
   * EVERY RESULT RECORDED ON THIS POINT, oldest first (QHS-02). The current `result` is the last.
   * Recording a result used to store a status and nothing else — not who, not when, not which
   * inspection released it — and a later write replaced it without trace. Absent on points recorded
   * before this existed, which is the honest reading of them: nobody knows.
   */
  history?: PointRecord[];
}

/** One result recorded on an ITP point: who recorded it, when, and the inspection that evidences it. */
export interface PointRecord {
  result: 'passed' | 'failed';
  recordedBy: string | null;
  recordedAt: string;
  /** The inspection request that witnessed or released this point, when one was cited. */
  inspectionRequestId: string | null;
  inspectionRequestNumber: string | null;
  note: string | null;
}

/** The facts about a cited inspection request the plan needs to judge it — read by the service. */
export interface CitedInspection {
  id: string;
  irNumber: string;
  projectId: string;
  status: string;
}

export interface NewItpPoint {
  activity: string;
  pointType: InspectionPointType;
  acceptanceCriteria?: string;
}

export interface Itp {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reference: string;
  title: string;
  discipline: string;
  status: ItpStatus;
  /** Who put the plan in force, and who declared its inspections complete. Both acts recorded nobody. */
  activatedBy: string | null;
  activatedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  points: ItpPoint[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  kind: ItpKind;
  /** System checklist only — the canonical id it is bound to. Never inferred from `discipline`. */
  system: ElvSystem | null;
  revision: number | null;
  parentItpId: string | null;
  sourceTemplateId: string | null;
  sourceTemplateVersion: number | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  supersededBy: string | null;
  supersededAt: string | null;
  returnedReason: string | null;
}

/** The fields an installation-inspection plan carries for the system-checklist columns: none. */
export const INSTALLATION_ITP_DEFAULTS = {
  kind: 'installation_inspection' as ItpKind,
  system: null, revision: null, parentItpId: null, sourceTemplateId: null, sourceTemplateVersion: null,
  submittedBy: null, submittedAt: null, approvedBy: null, approvedAt: null,
  supersededBy: null, supersededAt: null, returnedReason: null,
};

export interface NewItp {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  title: string;
  discipline?: string;
  points: NewItpPoint[];
  createdBy?: string | null;
}

const POINT_TYPES: InspectionPointType[] = ['hold', 'witness', 'review', 'surveillance'];

export function buildPoint(input: NewItpPoint): ItpPoint {
  if (!input.activity?.trim()) throw new Error('point activity is required');
  if (!POINT_TYPES.includes(input.pointType)) throw new Error(`pointType must be one of: ${POINT_TYPES.join(', ')}`);
  return {
    activity: input.activity.trim(),
    pointType: input.pointType,
    acceptanceCriteria: input.acceptanceCriteria?.trim() || '',
    result: 'pending',
  };
}

export function makeItp(input: NewItp): Itp {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!input.title?.trim()) throw new Error('title is required');
  if (!input.points || input.points.length === 0) throw new Error('at least one inspection point is required');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    title: input.title.trim(),
    discipline: input.discipline?.trim() || 'general',
    status: 'draft',
    activatedBy: null,
    activatedAt: null,
    closedBy: null,
    closedAt: null,
    points: input.points.map(buildPoint),
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
    ...INSTALLATION_ITP_DEFAULTS,
  };
}

/** The installation-inspection acts refuse a system checklist by name — the two never mix. */
function assertInstallationPlan(itp: Itp, act: string): void {
  if (itp.kind === 'system_commissioning') {
    throw new Error(
      `${act} is not allowed for a system commissioning ITP — it is approved as a revision, and its points are executed on the commissioning record bound to it`,
    );
  }
}

/**
 * draft → active. Putting the inspection plan in force.
 *
 * TAKES AN ACTOR NOW. `activateItp(itp)` took none, the service asserted no permission, and nothing
 * was recorded: the only gate on an ITP entering force was the route name derived from its path,
 * reachable through `quality.*`. So QA/QC wrote the plan, put it in force and later declared the
 * inspections complete, and not one of those three acts left a name behind.
 */
export function activateItp(itp: Itp, actorId: string | null = null): Itp {
  assertInstallationPlan(itp, 'activating');
  if (itp.status !== 'draft') throw new Error(`cannot activate from status ${itp.status}`);
  const now = new Date().toISOString();
  return { ...itp, status: 'active', activatedBy: actorId, activatedAt: now, updatedAt: now };
}

/**
 * Sign off a point (by index) as passed or failed. Only on an active ITP.
 *
 * QHS-02 — WHAT THE PLAN ALREADY SAYS, NOW HELD TO:
 *   · who recorded the result and when, kept with every earlier result on the point;
 *   · a PASSED point is final. A failure found afterwards is a nonconformance, raised as one, not a
 *     quiet rewrite of a sign-off somebody relied on. A FAILED point may be re-inspected and pass;
 *   · a HOLD point passes only on the APPROVED inspection request that released it, on this ITP's
 *     project. "Hold" is the plan author's own statement that work stops until the inspection
 *     releases it — a pass with no inspection behind it is the one thing that word rules out;
 *   · any other point may cite the inspection that evidences it, and the citation is checked the
 *     same way (this project; and approved, if it is cited for a pass).
 */
export function recordPointResult(
  itp: Itp,
  pointIndex: number,
  result: PointResult,
  record: { recordedBy?: string | null; inspection?: CitedInspection | null; note?: string | null } = {},
): Itp {
  assertInstallationPlan(itp, 'recording a result on the plan');
  if (itp.status !== 'active') throw new Error('can only record results on an active ITP');
  if (result !== 'passed' && result !== 'failed') throw new Error("result must be 'passed' or 'failed'");
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= itp.points.length) {
    throw new Error(`pointIndex ${pointIndex} out of range`);
  }
  const point = itp.points[pointIndex];
  if (point.result === 'passed') {
    throw new Error(`point ${pointIndex + 1} (${point.activity}) has already passed — a passed point is final; raise a later failure as an NCR`);
  }
  const inspection = record.inspection ?? null;
  if (inspection) {
    if (inspection.projectId !== itp.projectId) {
      throw new Error(`inspection request ${inspection.irNumber} does not belong to this ITP's project`);
    }
    if (result === 'passed' && inspection.status !== 'approved') {
      throw new Error(`inspection request ${inspection.irNumber} is not approved (status ${inspection.status}) — only an approved inspection can pass a point`);
    }
  } else if (point.pointType === 'hold' && result === 'passed') {
    throw new Error(`an approved inspection request is required to pass hold point ${pointIndex + 1} (${point.activity}) — cite the inspection that released it`);
  }
  const now = new Date().toISOString();
  const entry: PointRecord = {
    result,
    recordedBy: record.recordedBy ?? null,
    recordedAt: now,
    inspectionRequestId: inspection?.id ?? null,
    inspectionRequestNumber: inspection?.irNumber ?? null,
    note: record.note?.trim() || null,
  };
  const points = itp.points.map((p, i) => (i === pointIndex ? { ...p, result, history: [...(p.history ?? []), entry] } : p));
  return { ...itp, points, updatedAt: now };
}

export function allPointsResolved(itp: Itp): boolean {
  return itp.points.every((p) => p.result !== 'pending');
}

/** active → closed. Declaring the inspections complete, and saying who declared it. */
export function closeItp(itp: Itp, actorId: string | null = null): Itp {
  assertInstallationPlan(itp, 'closing');
  if (itp.status !== 'active') throw new Error(`cannot close from status ${itp.status}`);
  if (!allPointsResolved(itp)) throw new Error('cannot close — some inspection points are still pending');
  const now = new Date().toISOString();
  return { ...itp, status: 'closed', closedBy: actorId, closedAt: now, updatedAt: now };
}

export const ITP_EVENT = {
  created: 'quality.itp.created',
  activated: 'quality.itp.activated',
  closed: 'quality.itp.closed',
} as const;
