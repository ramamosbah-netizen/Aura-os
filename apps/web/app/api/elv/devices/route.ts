import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

// BFF: list + create ELV devices via the Nest ELV API. Read-forward only — the API enforces
// tenant/validation; this passes the identity cookie through.
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const query = new URLSearchParams();
  for (const key of ['projectId', 'system', 'status'] as const) {
    const v = searchParams.get(key);
    if (v) query.append(key, v);
  }
  const qs = query.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/elv/devices${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'ELV API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; tag?: string };
  if (!body.projectId || !body.tag) {
    return Response.json({ error: 'projectId and tag are required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/elv/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'ELV API unreachable' }, { status: 502 });
  }
}
