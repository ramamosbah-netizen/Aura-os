import { randomUUID } from 'node:crypto';

/**
 * Document Submittal — a controlled document (shop drawing, material data, method statement, etc.)
 * submitted to the consultant for review. Returns with the standard review code:
 *   A = approved, B = approved with comments, C = revise & resubmit, D = rejected.
 * Lifecycle: draft → submitted → returned (carrying the code). Code A/B close it out; C/D require
 * a resubmission (a new revision). Distinct from a transmittal (which merely conveys documents).
 */
export type SubmittalStatus = 'draft' | 'submitted' | 'returned';
export type ReviewCode = 'A' | 'B' | 'C' | 'D';
export type SubmittalDiscipline = 'architectural' | 'structural' | 'mep' | 'elv' | 'civil' | 'other';

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
  returnedAt: string | null;
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

const DISCIPLINES: SubmittalDiscipline[] = ['architectural', 'structural', 'mep', 'elv', 'civil', 'other'];

export function makeSubmittal(input: NewSubmittal): Submittal {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!input.title?.trim()) throw new Error('title is required');
  const discipline = input.discipline ?? 'other';
  if (!DISCIPLINES.includes(discipline)) throw new Error(`discipline must be one of: ${DISCIPLINES.join(', ')}`);
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
    returnedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function submitForReview(s: Submittal): Submittal {
  if (s.status !== 'draft') throw new Error(`cannot submit from status ${s.status}`);
  const now = new Date().toISOString();
  return { ...s, status: 'submitted', submittedAt: now, updatedAt: now };
}

/** Consultant returns the submittal with a review code (A–D) and optional comments. */
export function returnWithCode(s: Submittal, reviewCode: ReviewCode, reviewComments?: string): Submittal {
  if (s.status !== 'submitted') throw new Error(`cannot return from status ${s.status} — must be submitted first`);
  if (!['A', 'B', 'C', 'D'].includes(reviewCode)) throw new Error('reviewCode must be A, B, C, or D');
  const now = new Date().toISOString();
  return { ...s, status: 'returned', reviewCode, reviewComments: reviewComments?.trim() || '', returnedAt: now, updatedAt: now };
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
    returnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const SUBMITTAL_EVENT = {
  submitted: 'doccontrol.submittal.submitted',
  returned: 'doccontrol.submittal.returned',
} as const;
