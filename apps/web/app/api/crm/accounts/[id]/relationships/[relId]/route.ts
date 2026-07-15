import { apiBase, authHeader } from '@/lib/api';

// BFF: G6 relationship graph — remove an edge.

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; relId: string }> }): Promise<Response> {
  const { id, relId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/${id}/relationships/${relId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
