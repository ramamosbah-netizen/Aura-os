/**
 * Field-level before/after diff for audit trails (enterprise-readiness P1-2).
 *
 * The event/audit log records *that* a record changed and its new payload, but not what a value
 * changed *from*. This helper produces the missing "from → to" record: given a before and after
 * snapshot and the fields that matter, it returns only the fields that actually changed, each as
 * `{ from, to }`. Callers attach the result to the event payload (`changes`) / audit-log so the
 * timeline can answer "who changed the quote total from 80,000 to 95,000, and when."
 *
 * Values are compared by JSON equality (so arrays/objects diff by content). `null`/`undefined` are
 * normalised to `null`, so a partial patch that doesn't touch a field never registers as a change.
 */
export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

export function diffFields<T extends object>(
  before: T,
  after: T,
  fields: ReadonlyArray<keyof T>,
): FieldChanges {
  const changes: FieldChanges = {};
  for (const f of fields) {
    const a = before[f] ?? null;
    const b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[f as string] = { from: a, to: b };
    }
  }
  return changes;
}
