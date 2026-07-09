import { apiBase, authHeader } from '@/lib/api';

// BFF: calendar holidays/adjustments sub-resources (Admin Center phase 2).
// Proxies /api/admin/calendar/:id/(holidays|adjustments) to the Nest API.

const ALLOWED = new Set(['holidays', 'adjustments']);

async function proxy(method: string, id: string, sub: string, request: Request): Promise<Response> {
  if (!ALLOWED.has(sub)) return Response.json({ error: 'not found' }, { status: 404 });
  const qs = new URL(request.url).searchParams.toString();
  const url = `${apiBase()}/api/v1/admin/calendar/${encodeURIComponent(id)}/${sub}${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(await authHeader()),
      },
      body: method === 'POST' ? JSON.stringify(await request.json().catch(() => ({}))) : undefined,
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Calendar API unreachable' }, { status: 502 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; sub: string }> }): Promise<Response> {
  const { id, sub } = await params;
  return proxy('GET', id, sub, request);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sub: string }> }): Promise<Response> {
  const { id, sub } = await params;
  return proxy('POST', id, sub, request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sub: string }> }): Promise<Response> {
  const { id, sub } = await params;
  return proxy('DELETE', id, sub, request);
}
