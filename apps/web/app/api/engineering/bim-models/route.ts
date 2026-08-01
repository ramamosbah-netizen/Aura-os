import { apiBase, authHeader } from '@/lib/api';

// Client-side register proxy for BIM models. GET (list) is fetched server-side in the
// Engineering page via getJson; this handler forwards the register from the client component.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    name?: string;
    discipline?: string;
    format?: string;
    revision?: string;
    status?: string;
    federationGroup?: string;
    fileUrl?: string;
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
