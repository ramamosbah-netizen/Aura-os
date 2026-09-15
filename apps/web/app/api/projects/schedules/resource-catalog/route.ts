import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).search;
    const res = await apiFetch(`${apiBase()}/api/v1/projects/schedules/resource-catalog${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
