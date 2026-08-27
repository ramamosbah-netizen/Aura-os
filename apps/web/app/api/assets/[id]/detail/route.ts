import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Asset 360 read — the register row with its maintenance, open-job count, and disposal.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/assets/${id}/detail`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
