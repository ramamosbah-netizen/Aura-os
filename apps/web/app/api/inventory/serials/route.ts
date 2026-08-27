import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Register a serialised unit. List is server-fetched via getJson.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    serialNumber?: string; itemCode?: string; itemName?: string; warehouse?: string;
  };
  if (!body.serialNumber || !body.itemCode || !body.itemName) {
    return Response.json({ error: 'serialNumber, itemCode and itemName required' }, { status: 400 });
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/serials`, {
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
