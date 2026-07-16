// Shared relationship-attention primitives — the single source of truth for
// "when has a record gone quiet". The activity command center, the pipeline
// command center and the relationship-intelligence alert engine all compose these
// so the same deal is never "stalled" in one view and healthy in another.
//
// The deterministic time math (daysSince/hoursSince/isQuiet) lives in @aura/shared so
// shared domain predicates (leadAttention, opportunityAttention) can reuse it without a
// module dependency; re-exported here so existing '@aura/crm' consumers are unchanged.
export { daysSince, hoursSince, isQuiet } from '@aura/shared';
import { isLiveActivity } from './domain/activity';

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
  completedAt: string | null;
  createdAt: string;
}

/** Most-recent touch (ISO) per related record id, from the activity stream. */
export function lastActivityByRecord(activities: ActivityTouch[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of activities) {
    if (!a.relatedId) continue;
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
 * is the whole point of the projection.
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

