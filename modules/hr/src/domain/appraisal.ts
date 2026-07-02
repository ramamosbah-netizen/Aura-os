import { randomUUID } from 'node:crypto';

// HR domain — framework-free. A PerformanceAppraisal is a review-cycle record for an employee:
// weighted competency scores → an overall 0–100 rating, with a draft → submitted → acknowledged
// lifecycle. Criteria are stored as a jsonb array so the rubric can vary per cycle.

export type AppraisalStatus = 'draft' | 'submitted' | 'acknowledged';

export interface AppraisalCriterion {
  name: string;
  weight: number; // relative importance (>0), normalised
  score: number;  // 0–5
}

export interface PerformanceAppraisal {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  employeeName: string | null;
  period: string; // e.g. '2026-H1' or '2026'
  reviewerId: string | null;
  criteria: AppraisalCriterion[];
  overallScore: number; // weighted 0–100
  status: AppraisalStatus;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPerformanceAppraisal {
  tenantId: string;
  companyId?: string | null;
  employeeId: string;
  employeeName?: string | null;
  period: string;
  reviewerId?: string | null;
  criteria: AppraisalCriterion[];
  strengths?: string | null;
  improvements?: string | null;
  comments?: string | null;
  createdBy?: string | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Weighted 0–100 overall from criteria (each score 0–5, weights normalised). */
export function computeOverallScore(criteria: AppraisalCriterion[]): number {
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  if (totalWeight <= 0) return 0;
  const weighted = criteria.reduce((s, c) => s + (Number(c.weight) || 0) * (Number(c.score) || 0), 0);
  return r2((weighted / totalWeight) * 20); // 0–5 → 0–100
}

export function makePerformanceAppraisal(input: NewPerformanceAppraisal): PerformanceAppraisal {
  const now = new Date().toISOString();
  const criteria = (input.criteria ?? []).map((c) => ({
    name: c.name.trim(),
    weight: Number(c.weight) || 0,
    score: Math.max(0, Math.min(5, Number(c.score) || 0)),
  }));
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    employeeId: input.employeeId,
    employeeName: input.employeeName?.trim() || null,
    period: input.period.trim(),
    reviewerId: input.reviewerId ?? null,
    criteria,
    overallScore: computeOverallScore(criteria),
    status: 'draft',
    strengths: input.strengths?.trim() || null,
    improvements: input.improvements?.trim() || null,
    comments: input.comments?.trim() || null,
    submittedAt: null,
    acknowledgedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function submitAppraisal(a: PerformanceAppraisal): PerformanceAppraisal {
  return { ...a, status: 'submitted', submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export function acknowledgeAppraisal(a: PerformanceAppraisal): PerformanceAppraisal {
  return { ...a, status: 'acknowledged', acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

// ── Org chart (derived from employee reporting lines) ──────────────────────────

export interface OrgChartNode {
  id: string;
  name: string;
  role: string;
  department: string;
  reports: OrgChartNode[];
}

interface OrgEmployee { id: string; firstName: string; lastName: string; role: string; department: string; managerId: string | null }

/** Build the reporting tree from a flat employee list (managerId → parent). Orphans become roots. */
export function buildOrgChart(employees: OrgEmployee[]): OrgChartNode[] {
  const nodes = new Map<string, OrgChartNode>();
  for (const e of employees) {
    nodes.set(e.id, { id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), role: e.role, department: e.department, reports: [] });
  }
  const roots: OrgChartNode[] = [];
  for (const e of employees) {
    const node = nodes.get(e.id)!;
    const parent = e.managerId ? nodes.get(e.managerId) : undefined;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }
  return roots;
}
