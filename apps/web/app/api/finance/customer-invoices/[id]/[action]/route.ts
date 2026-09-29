import { apiFetch, apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['issue', 'receipts', 'cancel']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/finance/customer-invoices/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}

/** Read-only: an invoice's receipts (AR-INV-02). No other action is readable through this route. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (action !== 'receipts') return Response.json({ error: 'unknown action' }, { status: 404 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/finance/customer-invoices/${id}/receipts`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
