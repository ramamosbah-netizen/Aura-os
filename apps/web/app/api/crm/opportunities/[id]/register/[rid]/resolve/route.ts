import { apiBase, authHeader } from '@/lib/api';

// BFF: resolve a register item (decide / validate / invalidate / resolve).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; rid: string }> },
): Promise<Response> {
  const { id, rid } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/${id}/register/${rid}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
