import { type NextRequest } from 'next/server';
import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF read for the append-only physical quantity ledger. */
export async function GET(request: NextRequest): Promise<Response> {
  const query = new URLSearchParams();
  for (const key of ['projectId', 'boqItemId', 'limit']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/quantity-ledger?${query.toString()}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
