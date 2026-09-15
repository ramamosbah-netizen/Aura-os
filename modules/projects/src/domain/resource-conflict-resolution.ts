import { type Id, newId } from '@aura/shared';
import { type ResourceRef, toResourceRef } from './resource-ref';

/**
 * §22 — who is dealing with a conflict, and what they decided.
 *
 * THE CONFLICT IS STILL NOT A RECORD. Feasibility is derived on every read and stays that way; the
 * rule this file must never break is that nothing here can make a conflicted resource read as
 * fine. What is recorded is the human half, which was missing entirely:
 *
 *     the conflict    derived, never stored, true or false right now
 *     the ownership   a named person took it on          -> stored
 *     the decision    what they did about it             -> stored
 *
 * A surfaced conflict that belongs to nobody is a conflict two planners each assume the other is
 * handling. Its only evidence of progress was the conflict eventually disappearing — which says
 * nothing about whether anyone resolved it or the dates simply moved underneath it.
 *
 * CLOSING ONE DOES NOT CLEAR THE CONFLICT. If an owner records a resolution and the next read still
 * says CONFLICTED, both are shown: owned, decided, still conflicted. That is the honest state and
 * the one worth seeing — and it is why this carries no flag that any screen could read instead of
 * the derived verdict.
 *
 * KEYED BY RESOURCE AND PERIOD, because a conflict has no stable identity: a clash on Tuesday and
 * Wednesday becomes a clash on Tuesday when one booking moves. An owner takes on a RESOURCE for a
 * WINDOW, which is something a person can actually be accountable for.
 */

export type ConflictResolutionStatus = 'owned' | 'resolved' | 'accepted';

export interface ResourceConflictResolution {
  id: Id;
  tenantId: Id;
  resource: ResourceRef;
  /** Inclusive. The period taken on, not the conflict's current day set. */
  from: string;
  to: string;
  /** The named person accountable for resolving it. Never derived from who booked what. */
  ownerId: Id;
  assignedAt: string;
  assignedBy: Id | null;
  status: ConflictResolutionStatus;
  /**
   * What was actually done — moved the task, replaced the resource, approved overtime, accepted
   * the exposure. Required to close, for the same reason releasing capacity is: a closed entry
   * with no decision is indistinguishable from somebody tidying their screen.
   */
  decision: string | null;
  decidedAt: string | null;
  decidedBy: Id | null;
}

export interface NewResourceConflictResolution {
  tenantId: Id;
  resource: ResourceRef;
  from: string;
  to: string;
  ownerId: Id;
  assignedBy?: Id | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Take on a resource's conflicts for a period. */
export function takeConflictOwnership(input: NewResourceConflictResolution): ResourceConflictResolution {
  const resource = toResourceRef(input.resource);
  if (!resource) throw new Error('taking on a conflict needs a valid resource: a known type and a non-empty id');
  if (!input.ownerId?.trim()) throw new Error('a conflict must be owned by a named person');
  if (!DATE.test(input.from) || !DATE.test(input.to)) throw new Error('conflict ownership dates must be YYYY-MM-DD');
  if (input.to < input.from) throw new Error('conflict ownership must end on or after it starts');
  return {
    id: newId(),
    tenantId: input.tenantId,
    resource,
    from: input.from,
    to: input.to,
    ownerId: input.ownerId.trim(),
    assignedAt: new Date().toISOString(),
    assignedBy: input.assignedBy ?? null,
    status: 'owned',
    decision: null,
    decidedAt: null,
    decidedBy: null,
  };
}

/**
 * Close it with what was done.
 *
 * `resolved` and `accepted` are kept apart deliberately, in DG-22.8's own language: a clash that
 * was fixed and an exposure that was taken on knowingly are different outcomes, and recording the
 * second as the first would lose the only fact anybody would later want.
 */
export function decideConflict(
  entry: ResourceConflictResolution,
  input: { status: Exclude<ConflictResolutionStatus, 'owned'>; decision: string; actorId?: Id | null },
): ResourceConflictResolution {
  if (entry.status !== 'owned') {
    throw new Error('this conflict has already been decided; take it on again to record a new decision');
  }
  const decision = input.decision?.trim();
  if (!decision) {
    // The next person to read this needs to know what changed. "Done" with nothing behind it is
    // indistinguishable from somebody clearing their screen.
    throw new Error('closing a conflict requires saying what was decided');
  }
  return {
    ...entry,
    status: input.status,
    decision,
    decidedAt: new Date().toISOString(),
    decidedBy: input.actorId ?? null,
  };
}

export const conflictIsOwned = (entry: Pick<ResourceConflictResolution, 'status'>): boolean =>
  entry.status === 'owned';

/** Does this ownership cover the given day? Inclusive at both ends. */
export const conflictCovers = (entry: Pick<ResourceConflictResolution, 'from' | 'to'>, day: string): boolean =>
  day >= entry.from && day <= entry.to;

/**
 * The entry that speaks for a booking's conflict, if any does.
 *
 * Overlap, not containment: an owner who took on the week owns a clash on the Tuesday inside it,
 * and an owner who took on one day owns their part of a week-long booking's problem. An OPEN
 * ownership outranks a decided one — what is being handled now matters more on a planner's screen
 * than what was decided last month.
 */
export function resolutionForInterval(
  entries: readonly ResourceConflictResolution[],
  interval: { from: string; to: string },
): ResourceConflictResolution | null {
  const overlapping = entries.filter((entry) => entry.from <= interval.to && entry.to >= interval.from);
  if (overlapping.length === 0) return null;
  const open = overlapping.filter(conflictIsOwned);
  const pool = open.length > 0 ? open : overlapping;
  return [...pool].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0];
}
