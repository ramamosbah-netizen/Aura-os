import { randomUUID } from 'node:crypto';
import { type Discipline, toDiscipline } from '@aura/shared';

/**
 * Document Submittal — a controlled document (shop drawing, material data, method statement, etc.)
 * submitted to the consultant for review. Returns with the standard review code:
 *   A = approved, B = approved with comments, C = revise & resubmit, D = rejected.
 * Lifecycle: draft → submitted → returned (carrying the code). Code A/B close it out; C/D require
 * a resubmission (a new revision). Distinct from a transmittal (which merely conveys documents).
 */
export type SubmittalStatus = 'draft' | 'submitted' | 'returned';
export type ReviewCode = 'A' | 'B' | 'C' | 'D';
/** @deprecated use the shared {@link Discipline} (ADR-0012); kept as an alias for callers. */
export type SubmittalDiscipline = Discipline;

export interface Submittal {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reference: string;
  title: string;
  discipline: SubmittalDiscipline;
  revision: number;
  status: SubmittalStatus;
  reviewCode: ReviewCode | null;
  reviewComments: string;
  submittedAt: string | null;
  /** Who sent it to the consultant. The row kept the timestamp and no actor. */
  submittedBy: string | null;
  returnedAt: string | null;
  /** Who recorded the consultant's decision. A review code arrived from nobody. */
  returnedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSubmittal {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  title: string;
  discipline?: SubmittalDiscipline;
  revision?: number;
  createdBy?: string | null;
}

export function makeSubmittal(input: NewSubmittal): Submittal {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!input.title?.trim()) throw new Error('title is required');
  const discipline = toDiscipline(input.discipline);
  const revision = input.revision === undefined ? 0 : Number(input.revision);
  if (!Number.isInteger(revision) || revision < 0) throw new Error('revision must be a non-negative integer');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    title: input.title.trim(),
    discipline,
    revision,
    status: 'draft',
    reviewCode: null,
    reviewComments: '',
    submittedAt: null,
    submittedBy: null,
    returnedAt: null,
    returnedBy: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** draft → submitted. Records WHO sent it out; the act used to record only when. */
export function submitForReview(s: Submittal, submittedBy: string | null): Submittal {
  if (s.status !== 'draft') throw new Error(`cannot submit from status ${s.status}`);
  const now = new Date().toISOString();
  return { ...s, status: 'submitted', submittedAt: now, submittedBy, updatedAt: now };
}

/**
 * Consultant returns the submittal with a review code (A–D) and optional comments.
 *
 * THE TRAILING ARGUMENTS ARE AN OPTIONS OBJECT ON PURPOSE. The actor and the comments are both
 * `string`, so adding the actor as a third positional parameter would have let every existing
 * `returnWithCode(s, 'B', 'looks fine')` call keep compiling while silently filing the comment text
 * as the person who recorded the decision. That exact substitution shipped once this month in
 * `reimburseClaim` and TypeScript could not see it. A named field cannot be passed by accident.
 */
export function returnWithCode(
  s: Submittal,
  reviewCode: ReviewCode,
  opts: { returnedBy: string | null; comments?: string },
): Submittal {
  if (s.status !== 'submitted') throw new Error(`cannot return from status ${s.status} — must be submitted first`);
  if (!['A', 'B', 'C', 'D'].includes(reviewCode)) throw new Error('reviewCode must be A, B, C, or D');
  const now = new Date().toISOString();
  return {
    ...s, status: 'returned', reviewCode,
    reviewComments: opts.comments?.trim() || '',
    returnedAt: now, returnedBy: opts.returnedBy, updatedAt: now,
  };
}

/** True when the returned code requires a resubmission (C = revise & resubmit, D = rejected). */
export function requiresResubmission(s: Submittal): boolean {
  return s.status === 'returned' && (s.reviewCode === 'C' || s.reviewCode === 'D');
}

/** Create the next-revision draft after a C/D return (revision incremented, review reset). */
export function reviseSubmittal(s: Submittal): Submittal {
  if (!requiresResubmission(s)) throw new Error('only a C/D-coded submittal can be revised');
  const now = new Date().toISOString();
  return {
    ...s,
    id: randomUUID(),
    revision: s.revision + 1,
    status: 'draft',
    reviewCode: null,
    reviewComments: '',
    submittedAt: null,
    submittedBy: null,
    returnedAt: null,
    returnedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Whether this submittal's two acts were performed by two different people, for the same reason the
 * revision carries `revisionSeparation`: a status says a thing happened, never who made it happen.
 * `null` = the pair has not both occurred yet, so there is nothing to judge.
 */
export function submittalProvenance(s: Submittal): 'recorded' | 'incomplete' | null {
  if (s.status !== 'returned') return s.status === 'submitted' ? (s.submittedBy ? 'recorded' : 'incomplete') : null;
  return s.submittedBy && s.returnedBy ? 'recorded' : 'incomplete';
}

export const SUBMITTAL_EVENT = {
  submitted: 'doccontrol.submittal.submitted',
  returned: 'doccontrol.submittal.returned',
} as const;
