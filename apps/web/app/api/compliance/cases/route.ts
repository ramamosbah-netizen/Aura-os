import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the compliance register. One collection for every authority — filtering by authorityCode,
// scope, subject, project or status is what makes SIRA and DCD views of the same list rather than
// two screens.
export async function GET(request: Request): Promise<Response> {
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/cases${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}
