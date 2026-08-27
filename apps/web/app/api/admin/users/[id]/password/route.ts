import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: set (or reset) another user's password — the administrator side of onboarding.
// The password only ever travels request-body → API; it is never logged or echoed back.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/admin/users/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Users API unreachable' }, { status: 502 });
  }
}
