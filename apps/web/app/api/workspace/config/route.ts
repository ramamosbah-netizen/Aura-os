import { apiBase, authHeader } from '@/lib/api';

// BFF: workspace access configuration (admin reads/writes the whole config).
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/workspace/config`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : {}, { status: res.status });
  } catch {
    return Response.json({ error: 'Workspace API unreachable' }, { status: 502 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/workspace/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Workspace API unreachable' }, { status: 502 });
  }
}
