import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    sourceType?: string;
    sourceId?: string;
    actionRequired?: string;
    assignedTo?: string;
    dueDate?: string;
  };

  if (!body.projectId || !body.sourceType || !body.actionRequired || !body.dueDate) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/hse/capas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/hse/capas`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
