import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Remove a link. The ITP is untouched — only T&C's statement that it applies here goes away. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<Response> {
  const { id, linkId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/itp-links/${linkId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
