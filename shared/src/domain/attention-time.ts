// Deterministic time primitives for attention/health rules. These live in @aura/shared
// so any layer — shared domain predicates (leadAttention, opportunityAttention), modules,
// API, and web — composes the SAME "how quiet has this gone" math. `shared` must never
// import from a module, so the primitives a shared predicate needs belong here; the CRM
// module re-exports these from its attention barrel to keep one source of truth.

/** Whole days since an ISO timestamp, or null when there is none. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  return iso === null ? null : Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}

/** Whole hours since an ISO timestamp, or null when there is none. */
export function hoursSince(iso: string | null, now: Date = new Date()): number | null {
  return iso === null ? null : Math.floor((now.getTime() - new Date(iso).getTime()) / 3600000);
}

/** Quiet = never touched, or last touch older than the threshold (days). */
export function isQuiet(lastAt: string | null, thresholdDays: number, now: Date = new Date()): boolean {
  if (lastAt === null) return true;
  const ds = daysSince(lastAt, now);
  return ds !== null && ds >= thresholdDays;
}
