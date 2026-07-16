import { apiBase, authHeader } from '@/lib/api';

// BFF: activity workflow actions — complete / cancel / reopen.

const ACTIONS = new Set(['complete', 'cancel', 'reopen', 'start']);

export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: 'unknown action' }, { status: 400 });
  // complete carries an optional { outcome, followUp } body — forward it through.
  const body = await req.json().catch(() => null);
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/activities/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
