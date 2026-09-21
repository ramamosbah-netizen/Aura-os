import { randomUUID } from 'node:crypto';

/**
 * Site Daily Report (G-34) — the governed, unified site-execution record for one project-day. It is
 * the container that ties the site diary together: work summary, site conditions, and the child
 * line-items (labour, plant, installation progress, delays, evidence). It walks a controlled
 * approval state machine and, once approved, is immutable:
 *
 *   draft ─submit→ submitted ─start_review→ under_review ─┬─approve→ approved
 *      ▲                                                   └─reject(reason)→ rejected
 *      └────────────────────────── (rejected → draft to correct & resubmit) ─────────────┘
 *
 * Child line-items can be attached only while the report is `draft` — once submitted the record is a
 * frozen snapshot, and an approved report cannot be edited or re-opened (raise the next day's report).
 */
export type DailyReportStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

/** Allowed forward transitions. `rejected` returns to `draft` for correction; `approved` is terminal. */
export const DAILY_REPORT_TRANSITIONS: Record<DailyReportStatus, DailyReportStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: [],
};

export interface DailyReport {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reportNumber: string;
  date: string; // YYYY-MM-DD
  workDescription: string;
  /** Weather / working conditions on site. */
  siteConditions: string | null;
  safetyNotes: string | null;
  status: DailyReportStatus;
  // legacy convenience counts (kept; the real detail is in the child line-items).
  manpowerCount: number;
  equipmentCount: number;
  preparedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDailyReport {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reportNumber?: string;
  date: string;
  workDescription: string;
  siteConditions?: string | null;
  safetyNotes?: string | null;
  manpowerCount?: number;
  equipmentCount?: number;
  status?: DailyReport['status'];
  createdBy?: string | null;
}

export function makeDailyReport(input: NewDailyReport): DailyReport {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reportNumber: input.reportNumber?.trim() || `DR-${input.date}`,
    date: input.date,
    workDescription: input.workDescription.trim(),
    siteConditions: input.siteConditions?.trim() || null,
    safetyNotes: input.safetyNotes?.trim() || null,
    status: input.status ?? 'draft',
    manpowerCount: input.manpowerCount ?? 0,
    equipmentCount: input.equipmentCount ?? 0,
    preparedBy: input.createdBy ?? null,
    submittedBy: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── State machine ────────────────────────────────────────────────────────────

export class SiteReportTransitionError extends Error {
  constructor(from: DailyReportStatus, to: DailyReportStatus) {
    // "can only" so the API error taxonomy classifies this 409 CONFLICT, not 500.
    super(`a site report in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'SiteReportTransitionError';
  }
}

export function canTransitionReport(from: DailyReportStatus, to: DailyReportStatus): boolean {
  return DAILY_REPORT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReportTransition(from: DailyReportStatus, to: DailyReportStatus): void {
  if (!canTransitionReport(from, to)) throw new SiteReportTransitionError(from, to);
}

/** Child line-items may be attached only while the report is an open draft. */
export function assertReportEditable(report: DailyReport): void {
  if (report.status !== 'draft') {
    throw new SiteReportTransitionError(report.status, 'draft');
  }
}

const touch = (r: DailyReport): DailyReport => ({ ...r, updatedAt: new Date().toISOString() });

/** draft → submitted. Requires a work description (a report with no content cannot be submitted). */
export function submitReport(r: DailyReport, actorId: string | null): DailyReport {
  assertReportTransition(r.status, 'submitted');
  if (!r.workDescription?.trim()) throw new Error('a work description is required before submitting');
  return { ...touch(r), status: 'submitted', submittedBy: actorId, submittedAt: new Date().toISOString() };
}

/** submitted → under_review. */
export function startReviewReport(r: DailyReport, reviewerId: string | null): DailyReport {
  assertReportTransition(r.status, 'under_review');
  return { ...touch(r), status: 'under_review', reviewedBy: reviewerId, reviewedAt: new Date().toISOString() };
}

/**
 * under_review → approved (immutable thereafter).
 *
 * THE PERSON WHO WROTE THE DAY DOES NOT SIGN IT OFF. This record was BUILT for that check —
 * `preparedBy`, `submittedBy`, `reviewedBy` and `approvedBy` are four separate columns with four
 * separate timestamps — and nothing connected them. Measured against the running API as one Site
 * Engineer, every step returned success and all four columns came back with the same name.
 *
 * A daily report is the contemporaneous record of what happened on site: it is what a delay claim,
 * a variation and a payment dispute are later argued from. A day written and signed off by one
 * person is a note to self with a status field on it.
 */
export function approveReport(r: DailyReport, actorId: string | null): DailyReport {
  assertReportTransition(r.status, 'approved');
  if (actorId && (actorId === r.preparedBy || actorId === r.submittedBy)) {
    throw new Error('the person who prepared or submitted this daily report may not approve their own — the day is the record a claim is argued from');
  }
  return { ...touch(r), status: 'approved', approvedBy: actorId, approvedAt: new Date().toISOString() };
}

/**
 * under_review → rejected (reason mandatory).
 *
 * IT NO LONGER REWRITES `reviewedBy`. The line was `reviewedBy: actorId ?? r.reviewedBy`, so the
 * person rejecting REPLACED whoever actually performed the review, and the record of who looked at
 * the day was overwritten by the record of who turned it down. That is the same fabrication wave C
 * removed from `approveDocument`, and it is the same answer: the review already recorded its own
 * actor in `startReviewReport`, and a later act does not get to restate it.
 */
export function rejectReport(r: DailyReport, actorId: string | null, reason: string): DailyReport {
  if (!reason?.trim()) throw new Error('a rejection reason is required');
  assertReportTransition(r.status, 'rejected');
  if (actorId && (actorId === r.preparedBy || actorId === r.submittedBy)) {
    throw new Error('the person who prepared or submitted this daily report may not reject their own — withdrawing it is a resubmission, not a review');
  }
  return { ...touch(r), status: 'rejected', rejectionReason: reason.trim() };
}

/**
 * Whether the day was written and signed off by two different people, reported rather than assumed.
 * `null` = not approved yet, so there is no pair to judge; `unverifiable` = approved before the
 * authorship columns were filled, which is a fact about the record and not a clean bill of health.
 */
export function reportSeparation(r: DailyReport): 'enforced' | 'unverifiable' | null {
  if (!r.approvedBy) return null;
  return r.preparedBy || r.submittedBy ? 'enforced' : 'unverifiable';
}

/** rejected → draft (re-open to correct and resubmit). */
export function reopenReport(r: DailyReport): DailyReport {
  assertReportTransition(r.status, 'draft');
  return { ...touch(r), status: 'draft' };
}

export const SITE_REPORT_EVENT = {
  created: 'site.daily_report.created',
  submitted: 'site.daily_report.submitted',
  reviewStarted: 'site.daily_report.review_started',
  approved: 'site.daily_report.approved',
  rejected: 'site.daily_report.rejected',
} as const;
