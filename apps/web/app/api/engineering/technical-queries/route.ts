import { apiBase, authHeader } from '@/lib/api';

// Client-side create proxy for Technical Queries. GET (list) is fetched server-side in the
// Engineering page via getJson; this handler forwards the create from the client component.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    code?: string;
    title?: string;
    query?: string;
    priority?: string;
    discipline?: string;
    drawingReference?: string;
    costImpact?: boolean;
    timeImpact?: boolean;
  };

  if (!body.projectId || !body.code || !body.query) {
    return Response.json({ error: 'projectId, code and query required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/technical-queries`, {
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
