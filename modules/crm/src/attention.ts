// Shared relationship-attention primitives — the single source of truth for
// "when has a record gone quiet". The activity command center, the pipeline
// command center and the relationship-intelligence alert engine all compose these
// so the same deal is never "stalled" in one view and healthy in another.

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

/** Whole days since an ISO timestamp, or null when there is none. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  return iso === null ? null : Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}

/** Quiet = never touched, or last touch older than the threshold. */
export function isQuiet(lastAt: string | null, thresholdDays: number, now: Date = new Date()): boolean {
  if (lastAt === null) return true;
  const ds = daysSince(lastAt, now);
  return ds !== null && ds >= thresholdDays;
}
