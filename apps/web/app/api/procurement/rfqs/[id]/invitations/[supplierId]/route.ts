import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: withdraw an invitation while the enquiry is still a draft (BUY-03).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
): Promise<Response> {
  const { id, supplierId } = await params;
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/procurement/rfqs/${id}/invitations/${encodeURIComponent(supplierId)}`,
      { method: 'DELETE', headers: await authHeader(), cache: 'no-store' },
    );
    if (res.status === 204) return new Response(null, { status: 204 });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
