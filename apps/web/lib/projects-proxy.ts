import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * The forwarding half of the Projects BFF routes.
 *
 * Extracted because §21 alone adds eight routes that differ only in path, method and which fields
 * they accept — and the part worth reading in each of those files is the field list, not four
 * repetitions of try/fetch/json/502.
 *
 * What is deliberately NOT extracted is the whitelisting. Each route still names the fields it
 * forwards, because "forward whatever the browser sent" is how a field the API never meant to
 * expose reaches it. The helper takes an already-built body and does not inspect it.
 */
export async function forwardToProjects(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const { method = 'GET', body } = init;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(await authHeader()),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
    });
    // The API's status is passed through untouched. A 409 from a lifecycle guard and a 403 from a
    // permission check must reach the screen as themselves — collapsing them into 400 would make
    // "you may not do this" and "that move does not exist" indistinguishable to the user.
    const data = await res.json().catch(() => (res.ok ? null : { error: 'Projects API error' }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

/** Build a query string from the params a route chooses to pass on, dropping the absent ones. */
export function projectsQuery(source: URLSearchParams, keys: readonly string[]): string {
  const q = new URLSearchParams();
  for (const key of keys) {
    const value = source.get(key);
    if (value) q.append(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Trimmed string or undefined — the shape every optional text field below wants. */
export const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * References an issue points at, cleaned to the four fields the API accepts.
 *
 * A reference is an ADDRESS: module, record type, record id, and a label to show. Nothing else is
 * forwarded, because anything more would be a second, staler copy of a record another module owns.
 */
export function issueReferences(v: unknown): Array<Record<string, string | undefined>> | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => text(r.module) && text(r.recordType) && text(r.recordId))
    .map((r) => ({
      module: text(r.module),
      recordType: text(r.recordType),
      recordId: text(r.recordId),
      label: text(r.label),
    }));
}
