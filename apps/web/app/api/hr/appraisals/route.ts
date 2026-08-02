import { apiBase, authHeader } from '@/lib/api';

// BFF: HR performance appraisals — list + create.

export async function GET(request: Request): Promise<Response> {
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/appraisals${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/appraisals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}
