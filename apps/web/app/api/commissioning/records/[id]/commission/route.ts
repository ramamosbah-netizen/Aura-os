import { apiBase, authHeader } from '@/lib/api';

// Commission (witnessed sign-off) a record — the event that unlocks handover.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    commissionedBy?: string;
    witnessedBy?: string;
  };

  if (!body.commissionedBy || !body.witnessedBy) {
    return Response.json({ error: 'commissionedBy and witnessedBy required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/commissioning/records/${id}/commission`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
