import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/bim-models${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    code?: string;
    name?: string;
  };

  if (!body.projectId || !body.code || !body.name) {
    return Response.json({ error: 'projectId, code and name required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/bim-models`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
