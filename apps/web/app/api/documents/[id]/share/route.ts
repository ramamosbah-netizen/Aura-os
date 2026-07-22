import { apiBase, authHeader } from '@/lib/api';

// BFF: grant a share on a document. The kernel enforces that the caller holds SHARE *and* may
// delegate the level being granted (grantedPermissions ⊆ delegable(actor)); this proxy relays the
// kernel's answer verbatim, including a 403 when the grant exceeds what the caller may delegate.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/${id}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
