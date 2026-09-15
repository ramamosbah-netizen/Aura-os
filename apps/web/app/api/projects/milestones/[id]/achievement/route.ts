import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Record that a milestone was met, or withdraw a record that should not stand.
//
// Both carry a body and both are forwarded whole: POST carries the DAY IT WAS MET (which is not the
// day it was typed), and DELETE carries the reason, without which a withdrawal is refused.
const forward = async (request: Request, id: string, method: 'POST' | 'DELETE'): Promise<Response> => {
  try {
    const body = await request.text();
    const res = await apiFetch(`${apiBase()}/api/v1/projects/milestones/${encodeURIComponent(id)}/achievement`, {
      method,
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: body || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
};

export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  return forward(request, (await props.params).id, 'POST');
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  return forward(request, (await props.params).id, 'DELETE');
}
