import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: explicit review payload before Signal → Lead promotion.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/signals/${id}/promotion-preview`, {
      headers: { ...(await authHeader()) }, cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
