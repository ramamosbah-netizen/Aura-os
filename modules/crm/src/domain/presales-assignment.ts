import { type Id, newId } from '@aura/shared';

/**
 * A Pre-Sales study ASSIGNMENT: the package Sales hands to one engineer — what to study, from which
 * client input revision, by when, and who reviews it (STU-01).
 *
 * The owner's decision of 2026-09-26 governs it:
 *
 *   1. BIND IT. When Sales has assigned the study, only the assigned engineer authors it, the
 *      reviewer is the reviewer Sales named, and the input revision is the assignment's. Changing
 *      any of them is a REISSUE by Sales — a new version of the package, recorded with a reason.
 *   2. ACCEPT OR DECLINE, AND AN AUTOMATIC RETURN. The engineer accepts or declines (with a reason)
 *      from My Work; a decline returns the package to Sales. The engineer cannot close it by hand:
 *      it COMPLETES when the study it asked for is approved, and Sales receives "study approved —
 *      scope ready", which they acknowledge.
 *   3. DIRECT ROUTE ONLY. Tender studies are not assigned this way (yet).
 *
 * Before this record existed the assignment was two deal-team rows and an ordinary task: nothing
 * bound the study to it, the task could be ticked off with no study at all, and Sales heard nothing.
 */
export type PreSalesAssignmentStatus = 'assigned' | 'accepted' | 'declined' | 'completed';
export type PreSalesAssignmentAct = 'assigned' | 'accepted' | 'declined' | 'reissued' | 'completed' | 'acknowledged';

export interface PreSalesAssignmentEntry {
  version: number;
  act: PreSalesAssignmentAct;
  actorId: Id;
  at: string;
  note: string | null;
}

export interface PreSalesAssignment {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  opportunityId: Id;
  /** The package version. A reissue is a new version the engineer answers again. */
  version: number;
  assigneeId: Id;
  reviewerId: Id;
  inputRevision: string;
  dueDate: string;
  deliverables: string[];
  status: PreSalesAssignmentStatus;
  declineReason: string | null;
  assignedBy: Id;
  assignedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  completedAt: string | null;
  /** The approved study that completed it. */
  studyId: Id | null;
  /** When Sales took receipt of the returned study. */
  acknowledgedAt: string | null;
  history: PreSalesAssignmentEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PreSalesPackageInput {
  assigneeId: Id;
  reviewerId: Id;
  inputRevision: string;
  dueDate: string;
  deliverables: string[];
}

export const PRESALES_ASSIGNMENT_EVENT = {
  assigned: 'crm.presales_assignment.assigned',
  accepted: 'crm.presales_assignment.accepted',
  declined: 'crm.presales_assignment.declined',
  reissued: 'crm.presales_assignment.reissued',
  completed: 'crm.presales_assignment.completed',
  acknowledged: 'crm.presales_assignment.acknowledged',
} as const;

function required(value: string | null | undefined, label: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

/** The package itself, validated the way the lead conversion always validated it. */
function packageOf(input: PreSalesPackageInput): PreSalesPackageInput {
  const assigneeId = required(input.assigneeId, 'Pre-Sales assignee');
  const reviewerId = required(input.reviewerId, 'technical reviewer');
  if (assigneeId === reviewerId) throw new Error('technical reviewer must be independent from the Pre-Sales assignee');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate ?? '')) throw new Error('Pre-Sales due date is required');
  const deliverables = [...new Set((input.deliverables ?? []).map((item) => item.trim()).filter(Boolean))];
  if (deliverables.length === 0) throw new Error('at least one Pre-Sales deliverable is required');
  return { assigneeId, reviewerId, inputRevision: required(input.inputRevision, 'input revision'), dueDate: input.dueDate, deliverables };
}

export function makePreSalesAssignment(input: PreSalesPackageInput & {
  tenantId: Id; companyId?: Id | null; opportunityId: Id; assignedBy: Id;
}): PreSalesAssignment {
  const pkg = packageOf(input);
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    opportunityId: input.opportunityId,
    version: 1,
    ...pkg,
    status: 'assigned',
    declineReason: null,
    assignedBy: required(input.assignedBy, 'assigning user'),
    assignedAt: now,
    acceptedAt: null,
    declinedAt: null,
    completedAt: null,
    studyId: null,
    acknowledgedAt: null,
    history: [{ version: 1, act: 'assigned', actorId: input.assignedBy, at: now, note: null }],
    createdAt: now,
    updatedAt: now,
  };
}

function record(a: PreSalesAssignment, act: PreSalesAssignmentAct, actorId: Id, note: string | null, patch: Partial<PreSalesAssignment>): PreSalesAssignment {
  const now = new Date().toISOString();
  const next = { ...a, ...patch, updatedAt: now };
  return { ...next, history: [...a.history, { version: next.version, act, actorId, at: now, note }] };
}

export function acceptPreSalesAssignment(a: PreSalesAssignment, actorId: Id): PreSalesAssignment {
  if (a.assigneeId !== actorId) throw new Error(`only the assigned Pre-Sales engineer can accept this study (it is assigned to ${a.assigneeId})`);
  if (a.status !== 'assigned') throw new Error(`the Pre-Sales assignment is ${a.status}; only an assignment awaiting its engineer can be accepted`);
  return record(a, 'accepted', actorId, null, { status: 'accepted', acceptedAt: new Date().toISOString() });
}

export function declinePreSalesAssignment(a: PreSalesAssignment, actorId: Id, reason: string): PreSalesAssignment {
  if (a.assigneeId !== actorId) throw new Error(`only the assigned Pre-Sales engineer can decline this study (it is assigned to ${a.assigneeId})`);
  if (a.status !== 'assigned') throw new Error(`the Pre-Sales assignment is ${a.status}; only an assignment awaiting its engineer can be declined`);
  const why = (reason ?? '').trim();
  if (why.length < 3) throw new Error('a reason is required to decline a Pre-Sales study');
  return record(a, 'declined', actorId, why, { status: 'declined', declineReason: why, declinedAt: new Date().toISOString() });
}

/**
 * Sales changes the package — engineer, reviewer, input revision, due date or deliverables. It is a
 * new version, answered again by its engineer, and the reason is kept. A completed package can be
 * reissued too: a new client issue is new work, and the next study revision is written against it.
 */
export function reissuePreSalesAssignment(
  a: PreSalesAssignment,
  actorId: Id,
  changes: Partial<PreSalesPackageInput>,
  reason: string,
): PreSalesAssignment {
  const why = (reason ?? '').trim();
  if (why.length < 3) throw new Error('a reason is required to reissue a Pre-Sales study');
  const pkg = packageOf({
    assigneeId: changes.assigneeId ?? a.assigneeId,
    reviewerId: changes.reviewerId ?? a.reviewerId,
    inputRevision: changes.inputRevision ?? a.inputRevision,
    dueDate: changes.dueDate ?? a.dueDate,
    deliverables: changes.deliverables ?? a.deliverables,
  });
  const unchanged = pkg.assigneeId === a.assigneeId && pkg.reviewerId === a.reviewerId && pkg.inputRevision === a.inputRevision
    && pkg.dueDate === a.dueDate && JSON.stringify(pkg.deliverables) === JSON.stringify(a.deliverables);
  if (unchanged) throw new Error('a reissue must change the engineer, reviewer, input revision, due date or deliverables');
  return record({ ...a, version: a.version + 1 }, 'reissued', actorId, why, {
    ...pkg, status: 'assigned', declineReason: null, acceptedAt: null, declinedAt: null,
    completedAt: null, studyId: null, acknowledgedAt: null,
  });
}

/** The approved study completes the package it answers. Nobody closes it by hand. */
export function completePreSalesAssignment(a: PreSalesAssignment, study: { id: Id; authorId: Id; reviewerId: Id; inputRevision: string }, actorId: Id): PreSalesAssignment {
  if (a.status !== 'accepted') throw new Error(`the Pre-Sales assignment is ${a.status}; only an accepted assignment can be completed by its approved study`);
  assertStudyFollowsAssignment(a, study);
  return record(a, 'completed', actorId, null, { status: 'completed', completedAt: new Date().toISOString(), studyId: study.id });
}

export function acknowledgePreSalesReturn(a: PreSalesAssignment, actorId: Id): PreSalesAssignment {
  if (a.assignedBy !== actorId) throw new Error(`only ${a.assignedBy}, who assigned this study, can take receipt of it`);
  if (a.status !== 'completed') throw new Error(`the Pre-Sales assignment is ${a.status}; only a completed study can be received`);
  if (a.acknowledgedAt) throw new Error('this returned study has already been received');
  return record(a, 'acknowledged', actorId, null, { acknowledgedAt: new Date().toISOString() });
}

/**
 * THE BINDING (decision 1). A study written under an assignment is written by its engineer, for
 * its reviewer, on its input revision. Each refusal names what the assignment says, so the person
 * refused knows the change is Sales' to make — a reissue — and not theirs.
 */
export function assertStudyFollowsAssignment(
  a: PreSalesAssignment,
  study: { authorId: Id; reviewerId: Id; inputRevision: string },
): void {
  if (study.authorId !== a.assigneeId) {
    throw new Error(`only the assigned Pre-Sales engineer can write this study — it is assigned to ${a.assigneeId}; another engineer can only take it over through a reassignment by Sales`);
  }
  if (study.reviewerId !== a.reviewerId) {
    throw new Error(`the reviewer Sales assigned is ${a.reviewerId}; a different reviewer can only come through a reassignment by Sales`);
  }
  if (study.inputRevision.trim() !== a.inputRevision) {
    throw new Error(`the assignment is on input revision "${a.inputRevision}"; a study on "${study.inputRevision.trim()}" can only follow a reissue by Sales`);
  }
}

/** Starting or editing the study waits for the engineer to have taken the work on. */
export function assertAssignmentAccepted(a: PreSalesAssignment): void {
  if (a.status === 'assigned') throw new Error(`the Pre-Sales study is assigned to ${a.assigneeId} and not yet accepted; the study can only start once they accept it`);
  if (a.status === 'declined') throw new Error(`${a.assigneeId} declined this Pre-Sales study; it can only continue once Sales reassigns it`);
}
