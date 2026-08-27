import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/work-items/reminders/sync`, {
      method: 'POST',
      headers: { ...(await authHeader()), ...replayHeaders(request) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Task reminders API unreachable' }, { status: 502 });
  }
}
