// Shared relationship-attention primitives — the single source of truth for
// "when has a record gone quiet". The activity command center, the pipeline
// command center and the relationship-intelligence alert engine all compose these
// so the same deal is never "stalled" in one view and healthy in another.
//
// The deterministic time math (daysSince/hoursSince/isQuiet) lives in @aura/shared so
// shared domain predicates (leadAttention, opportunityAttention) can reuse it without a
// module dependency; re-exported here so existing '@aura/crm' consumers are unchanged.
export { daysSince, hoursSince, isQuiet } from '@aura/shared';

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

