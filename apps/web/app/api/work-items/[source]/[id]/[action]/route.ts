import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

const ACTIONS = new Set(['start', 'complete', 'reopen', 'reschedule']);

export async function POST(req: Request, { params }: { params: Promise<{ source: string; id: string; action: string }> }): Promise<Response> {
  const { source, id, action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: 'Unknown work-item action' }, { status: 400 });
  try {
    const body = await req.json().catch(() => null);
    const res = await apiFetch(`${apiBase()}/api/v1/work-items/${encodeURIComponent(source)}/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(req) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Work items API unreachable' }, { status: 502 });
  }
}
