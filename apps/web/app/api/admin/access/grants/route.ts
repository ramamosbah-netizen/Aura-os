import { apiBase, authHeader } from '@/lib/api';

// BFF: grant a role to a user.
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/access/grants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Access API unreachable' }, { status: 502 });
  }
}

// BFF: revoke a user's role grant (?userId=&roleId=).
export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const qs = new URLSearchParams({
    userId: url.searchParams.get('userId') ?? '',
    roleId: url.searchParams.get('roleId') ?? '',
  });
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/access/grants?${qs.toString()}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Access API unreachable' }, { status: 502 });
  }
}
