import { apiBase, authHeader } from '@/lib/api';

// Complete a work order, capturing the billable cost (drives the AMC → AR invoice reactor).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { cost?: number };
  try {
    const res = await fetch(`${apiBase()}/api/v1/amc/work-orders/${id}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'AMC Work Order API unreachable' }, { status: 502 });
  }
}
