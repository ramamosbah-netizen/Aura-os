import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    projectName?: string;
    date?: string;
    trade?: string;
    headcount?: number;
    hours?: number;
    subcontractorName?: string;
    notes?: string;
  };

  if (!body.projectId || !body.date || !body.trade || body.headcount === undefined || body.hours === undefined) {
    return Response.json({ error: 'projectId, date, trade, headcount and hours required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/site/labour`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
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
    const res = await fetch(`${apiBase()}/api/v1/site/labour`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
