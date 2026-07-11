import { apiBase, authHeader } from '@/lib/api';

// BFF: activity workflow actions — complete / cancel / reopen.

const ACTIONS = new Set(['complete', 'cancel', 'reopen']);

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: 'unknown action' }, { status: 400 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/activities/${id}/${action}`, {
      method: 'POST',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
