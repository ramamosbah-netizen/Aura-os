import { apiBase, authHeader } from '@/lib/api';

// BFF: unread badge counts (chat + mail) for the caller.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/unread`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({ chat: 0, mail: 0 })), { status: res.status });
  } catch {
    return Response.json({ chat: 0, mail: 0 }, { status: 200 });
  }
}
