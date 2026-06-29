import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    subject?: string;
    direction?: 'inbound' | 'outbound';
    sender?: string;
    recipient?: string;
  };

  if (!body.projectId || !body.code || !body.subject || !body.direction) {
    return Response.json({ error: 'projectId, code, subject and direction required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/doccontrol/correspondence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DocControl API unreachable' }, { status: 502 });
  }
}
