import { apiFetch, apiBase, authHeader } from '@/lib/api';

// The Site Daily Report 360 detail (report + all line-items).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/daily-reports/${id}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
