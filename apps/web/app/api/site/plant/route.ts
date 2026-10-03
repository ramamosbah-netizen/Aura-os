import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

// BFF: plant & equipment usage (COST-CODE-01). The plant strand had an API and no screen, so a
// project run through the screens never recorded plant at all.

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    date?: string;
    equipment?: string;
    hours?: number;
    /** Hourly rate, cost line and work package — passed through; the API validates them. */
    rate?: number;
    cbsNodeId?: string;
    wbsNodeId?: string;
    notes?: string;
  };

  if (!body.projectId || !body.date || !body.equipment || body.hours === undefined) {
    return Response.json({ error: 'projectId, date, equipment and hours required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/plant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}

/** Forwards the project scope upstream, by name — the same contract as the labour route. */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/plant${suffix}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
