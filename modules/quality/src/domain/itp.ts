import { randomUUID } from 'node:crypto';

/**
 * Inspection & Test Plan (ITP) — the QA plan defining, per work activity, the inspection points
 * the contractor must pass (Hold / Witness / Review / Surveillance) and their acceptance criteria.
 * Distinct from a one-off inspection request: the ITP is the *plan*; results are signed off against
 * its points. Lifecycle: draft → active → closed (closeable only once every point is resolved).
 */
export type ItpStatus = 'draft' | 'active' | 'closed';
export type InspectionPointType = 'hold' | 'witness' | 'review' | 'surveillance';
export type PointResult = 'pending' | 'passed' | 'failed';

export interface ItpPoint {
  activity: string;
  pointType: InspectionPointType;
  acceptanceCriteria: string;
  result: PointResult;
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
}

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
  };
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
  if (itp.status !== 'draft') throw new Error(`cannot activate from status ${itp.status}`);
  const now = new Date().toISOString();
  return { ...itp, status: 'active', activatedBy: actorId, activatedAt: now, updatedAt: now };
}

/** Sign off a point (by index) as passed or failed. Only on an active ITP. */
export function recordPointResult(itp: Itp, pointIndex: number, result: PointResult): Itp {
  if (itp.status !== 'active') throw new Error('can only record results on an active ITP');
  if (result !== 'passed' && result !== 'failed') throw new Error("result must be 'passed' or 'failed'");
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= itp.points.length) {
    throw new Error(`pointIndex ${pointIndex} out of range`);
  }
  const points = itp.points.map((p, i) => (i === pointIndex ? { ...p, result } : p));
  return { ...itp, points, updatedAt: new Date().toISOString() };
}

export function allPointsResolved(itp: Itp): boolean {
  return itp.points.every((p) => p.result !== 'pending');
}

/** active → closed. Declaring the inspections complete, and saying who declared it. */
export function closeItp(itp: Itp, actorId: string | null = null): Itp {
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
