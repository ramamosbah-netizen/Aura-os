import { apiBase, authHeader } from '@/lib/api';

// T4 — clarifications & addenda proxy (list + record).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const search = new URL(request.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/clarifications${search}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/clarifications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
