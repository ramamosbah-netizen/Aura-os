import { apiBase, authHeader } from '@/lib/api';

// Work Order 360 read — the visit with the contract that governs its SLA.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/amc/work-orders/${id}/detail`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'AMC Work Order API unreachable' }, { status: 502 });
  }
}
