import { apiFetch, apiBase, authHeader } from '@/lib/api';

// One proxy for the serial-unit transitions: issue · install · return · fault.
const ALLOWED = new Set(['issue', 'install', 'return', 'fault']);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) {
    return Response.json({ error: 'unknown serial action' }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/serials/${id}/${action}`, {
      method: 'PUT',
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
