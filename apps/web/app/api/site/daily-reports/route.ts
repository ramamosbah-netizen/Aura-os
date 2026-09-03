import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    date?: string;
    workDescription?: string;
    manpowerCount?: number;
    equipmentCount?: number;
  };

  if (typeof body.projectId !== 'string' || !body.projectId.trim()) {
    return Response.json({ error: 'projectId is required', message: 'Select a project before creating a daily report.' }, { status: 400 });
  }
  if (!body.date || !body.workDescription) {
    return Response.json({ error: 'date and workDescription required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/daily-reports`, {
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

export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/site/daily-reports`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
