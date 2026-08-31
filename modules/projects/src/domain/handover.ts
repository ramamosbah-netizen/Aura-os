import { createHash } from 'node:crypto';

/** JSON-safe frozen commercial handover evidence. */
export type HandoverSnapshot = Record<string, unknown>;

/** Canonical JSON: recursively sorted object keys; array order remains business-significant. */
export function canonicalizeHandoverSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeHandoverSnapshot);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        // Compare UTF-16 key order directly; localeCompare can vary by host locale.
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalizeHandoverSnapshot(entry)]),
    );
  }
  return value;
}

export function serializeHandoverSnapshot(snapshot: HandoverSnapshot): string {
  return JSON.stringify(canonicalizeHandoverSnapshot(snapshot));
}

export function hashHandoverSnapshot(snapshot: HandoverSnapshot): string {
  return createHash('sha256').update(serializeHandoverSnapshot(snapshot)).digest('hex');
}
