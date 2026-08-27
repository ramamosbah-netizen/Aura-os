import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Client-side register proxy for Commissioning records. GET (list) is fetched server-side
// in the Commissioning page via getJson; this forwards the register from the client.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    title?: string;
    system?: string;
    location?: string;
    pointsTotal?: number;
  };

  if (!body.projectId || !body.code || !body.title) {
    return Response.json({ error: 'projectId, code and title required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
