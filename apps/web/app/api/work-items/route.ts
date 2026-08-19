import { apiBase, authHeader, replayHeaders } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/work-items`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Work items API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/work-items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Work items API unreachable' }, { status: 502 });
  }
}
