// Shared relationship-attention primitives — the single source of truth for
// "when has a record gone quiet". The activity command center, the pipeline
// command center and the relationship-intelligence alert engine all compose these
// so the same deal is never "stalled" in one view and healthy in another.
//
// The deterministic time math (daysSince/hoursSince/isQuiet) lives in @aura/shared so
// shared domain predicates (leadAttention, opportunityAttention) can reuse it without a
// module dependency; re-exported here so existing '@aura/crm' consumers are unchanged.
export { daysSince, hoursSince, isQuiet } from '@aura/shared';
import { isCancelledActivity, isLiveActivity } from './domain/activity';

/** One shared threshold set (days). Change here, change everywhere. */
export const ATTENTION_THRESHOLDS = {
  /** An active account with no touch in this many days is "quiet". */
  accountIdleDays: 30,
  /** An open opportunity with no touch in this many days is "stalled". */
  opportunityIdleDays: 14,
  /** A live quote within this many days of expiry needs a nudge. */
  quoteExpiryDays: 7,
} as const;

/** Minimal shape the last-touch scan needs (Activity satisfies it). */
export interface ActivityTouch {
  relatedId: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
}

/**
 * Most-recent touch (ISO) per related record id, from the activity stream.
 *
 * THE STATUS RULE (shared with nextOpenActivityByRecord below, so the two can never disagree about
 * whether status matters): `cancelled` activities are excluded everywhere in this file. A cancelled
 * activity is work that was called off, not work that happened — counting one as a touch let anybody
 * clear a lead's STALE gap by creating and cancelling a call, with no contact ever made (observed
 * live 2026-07-20). Open/in-progress activities DO count, at createdAt: scheduling the next call is
 * a real act of working the record, and the record is not quiet while dated work sits on it.
 *
 * Where the two functions legitimately differ: this one also counts `completed` (a touch that
 * happened is still a touch), while the next-action projection wants only live work.
 */
export function lastActivityByRecord(activities: ActivityTouch[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of activities) {
    if (!a.relatedId || isCancelledActivity(a.status)) continue;
    const at = a.completedAt ?? a.createdAt;
    const prev = m.get(a.relatedId);
    if (!prev || at > prev) m.set(a.relatedId, at);
  }
  return m;
}

/** Minimal shape the next-action scan needs (Activity satisfies it). */
export interface OpenActivityCandidate {
  relatedId: string | null;
  status: string;
  subject: string;
  dueDate: string | null;
  assigneeId: string | null;
}

/** The next open activity on a record — what the Next Action IS. */
export interface NextOpenActivity {
  subject: string;
  dueIso: string | null;
  assigneeId: string | null;
}

/**
 * G2 — the next OPEN activity per related record id: the one work item that answers "what
 * happens next" on that record. Lives here, not in a controller, so every read model (pipeline,
 * relationship intelligence, opportunity 360, lead command) derives the next action the same way
 * and no two views can disagree about it.
 *
 * "Next" = earliest due date; an open activity with no due date only wins if nothing is dated
 * (undated work is real work, but dated work is more urgent). Completed/cancelled are ignored —
 * completing an activity therefore hands the next action to whatever is scheduled after it, which
 * is the whole point of the projection. Cancelled is excluded here for the same reason it is
 * excluded from lastActivityByRecord above: see THE STATUS RULE on that function.
 */
export function nextOpenActivityByRecord(activities: OpenActivityCandidate[]): Map<string, NextOpenActivity> {
  const m = new Map<string, NextOpenActivity>();
  for (const a of activities) {
    if (!a.relatedId || !isLiveActivity(a.status)) continue; // in-progress work is still the next action
    const prev = m.get(a.relatedId);
    if (!prev) {
      m.set(a.relatedId, { subject: a.subject, dueIso: a.dueDate, assigneeId: a.assigneeId });
      continue;
    }
    // A dated activity always beats an undated one; between two dated ones the earlier wins.
    const beatsUndated = prev.dueIso === null && a.dueDate !== null;
    const isEarlier = prev.dueIso !== null && a.dueDate !== null && a.dueDate < prev.dueIso;
    if (beatsUndated || isEarlier) m.set(a.relatedId, { subject: a.subject, dueIso: a.dueDate, assigneeId: a.assigneeId });
  }
  return m;
}

