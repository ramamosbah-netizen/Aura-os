import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    title?: string;
    submittalType?: string;
  };

  if (!body.projectId || !body.code || !body.title || !body.submittalType) {
    return Response.json({ error: 'projectId, code, title and submittalType required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/submittals`, {
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
