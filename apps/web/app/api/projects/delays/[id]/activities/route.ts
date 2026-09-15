import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Name the activities this delay hit, canonically — replacing whatever was named before.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await props.params;
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/delays/${encodeURIComponent(id)}/activities`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body, cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
