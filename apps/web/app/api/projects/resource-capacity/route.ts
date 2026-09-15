import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-capacity`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/resource-capacity`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
