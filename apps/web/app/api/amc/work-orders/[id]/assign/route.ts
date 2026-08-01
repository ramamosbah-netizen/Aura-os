import { apiBase, authHeader } from '@/lib/api';

// Assign a work order to a technician (open → assigned).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { technicianId?: string };
  if (!body.technicianId) {
    return Response.json({ error: 'technicianId required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/amc/work-orders/${id}/assign`, {
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
