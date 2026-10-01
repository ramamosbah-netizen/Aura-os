import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF read of the executive decision set (F-10), for the Command Center's CEO perspective. */
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/intelligence/executive-decisions`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}
