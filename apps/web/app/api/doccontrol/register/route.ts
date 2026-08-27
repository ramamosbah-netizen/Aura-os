import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Create a controlled register entry (drawing/document). List is server-fetched via getJson.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    documentNumber?: string;
    title?: string;
    discipline?: string;
    docType?: string;
    currentRevision?: string;
    status?: string;
    custodian?: string;
  };

  if (!body.projectId || !body.documentNumber || !body.title) {
    return Response.json({ error: 'projectId, documentNumber and title required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Doc Control API unreachable' }, { status: 502 });
  }
}
