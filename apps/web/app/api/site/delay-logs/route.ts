import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    date?: string;
    delayType?: string;
    description?: string;
    impactHours?: number;
  };

  if (!body.projectId || !body.date || !body.delayType || !body.description) {
    return Response.json({ error: 'projectId, date, delayType and description required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/site/delay-logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/site/delay-logs`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
