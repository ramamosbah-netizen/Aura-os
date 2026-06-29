import { apiBase, authHeader } from '@/lib/api';

// BFF: stock item detail (with movement history).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/inventory/stock/${id}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory API unreachable' }, { status: 502 });
  }
}
