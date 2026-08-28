import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: a cheap, caller-scoped notification badge. Do not fetch the full inbox just to render a bell.
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/notifications/unread-count`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({ count: 0 })), { status: res.status });
  } catch {
    return Response.json({ count: 0 }, { status: 502 });
  }
}
