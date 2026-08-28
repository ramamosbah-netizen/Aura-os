import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const response = await apiFetch(`${apiBase()}/api/v1/comms/stream`, { headers: { ...(await authHeader()), accept: 'text/event-stream' }, cache: 'no-store' }, 120_000);
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
  } catch {
    return new Response('event: error\ndata: {}\n\n', { status: 502, headers: { 'content-type': 'text/event-stream' } });
  }
}
