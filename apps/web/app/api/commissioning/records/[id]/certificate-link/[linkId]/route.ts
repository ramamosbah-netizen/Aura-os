import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Withdraw the certificate registration. The controlled document itself is untouched. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<Response> {
  const { id, linkId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/certificate-link/${linkId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
