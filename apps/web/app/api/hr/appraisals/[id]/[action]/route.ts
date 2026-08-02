import { apiBase, authHeader } from '@/lib/api';

// BFF: appraisal lifecycle — submit / acknowledge.

const ALLOWED = new Set(['submit', 'acknowledge']);

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 400 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/appraisals/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HR API unreachable' }, { status: 502 });
  }
}
