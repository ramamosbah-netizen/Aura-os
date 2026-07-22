import { apiBase, authHeader } from '@/lib/api';

// BFF: revoke one share. Requires SHARE on the document — whoever may grant access may take it
// away. The kernel decides; this relays.

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; permissionId: string }> },
): Promise<Response> {
  const { id, permissionId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/${id}/permissions/${permissionId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ revoked: false }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
