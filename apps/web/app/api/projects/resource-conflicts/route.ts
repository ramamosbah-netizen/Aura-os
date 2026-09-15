import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Who is dealing with a resource's conflicts. The API owns who may take one on; this carries the
// request so a second, weaker copy of that rule cannot drift from the real one.

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.toString();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-conflicts${query ? `?${query}` : ''}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-conflicts`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
