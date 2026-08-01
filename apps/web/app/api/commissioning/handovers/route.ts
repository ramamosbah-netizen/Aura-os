import { apiBase, authHeader } from '@/lib/api';

// Create a handover package. GET (list) is server-fetched in the Handover page via getJson.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    title?: string;
  };

  if (!body.projectId || !body.code || !body.title) {
    return Response.json({ error: 'projectId, code and title required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/commissioning/handovers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Handover API unreachable' }, { status: 502 });
  }
}
