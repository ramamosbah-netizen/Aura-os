import { apiBase, authHeader } from '@/lib/api';

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await fetch(`${apiBase()}/api/site/delay-logs/${id}/resolve`, {
      method: 'PUT',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
