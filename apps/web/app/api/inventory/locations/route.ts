import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { warehouse?: string; binCode?: string; description?: string; type?: string };
  if (!body.warehouse || !body.binCode) {
    return Response.json({ error: 'warehouse and binCode required' }, { status: 400 });
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory API unreachable' }, { status: 502 });
  }
}
