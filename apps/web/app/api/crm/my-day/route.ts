import { apiBase, authHeader } from '@/lib/api';

// BFF: C4 — Sales Workspace "My Day". `userId` passes through so a manager can open a rep's day;
// omitted, the API answers for the caller.

export async function GET(req: Request): Promise<Response> {
  const userId = new URL(req.url).searchParams.get('userId');
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/my-day${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
