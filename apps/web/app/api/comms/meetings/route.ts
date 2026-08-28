import { apiFetch, apiBase, authHeader } from '@/lib/api';

async function forward(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const body = method === 'POST' ? JSON.stringify(await request.json().catch(() => ({}))) : undefined;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/comms/meetings${new URL(request.url).search}`, { method, body, cache: 'no-store', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()) } });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Meetings API unreachable' }, { status: 502 }); }
}
export async function GET(request: Request) { return forward(request, 'GET'); }
export async function POST(request: Request) { return forward(request, 'POST'); }
