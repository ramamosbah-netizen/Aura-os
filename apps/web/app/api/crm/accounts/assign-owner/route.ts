import { apiBase, authHeader, currentUser } from '@/lib/api';

// BFF: "Assign to me" — stamps the signed-in user as the account owner.
// The owner comes from the session cookie server-side, never from the client body.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return Response.json({ error: 'accountId required' }, { status: 400 });
  const user = await currentUser();
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/${body.accountId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ ownerId: user.sub }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
