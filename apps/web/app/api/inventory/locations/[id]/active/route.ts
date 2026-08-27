import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Activate / deactivate a storage location.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/locations/${id}/active`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory API unreachable' }, { status: 502 });
  }
}
