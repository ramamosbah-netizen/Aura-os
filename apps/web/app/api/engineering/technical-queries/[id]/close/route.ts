import { apiFetch, apiBase, authHeader } from '@/lib/api';

// The raising side accepts the design answer as adequate to build to (responded → closed).
// A different authority from answering, and the API refuses a self-close even where one person
// holds both permissions — so this carries no body and decides nothing here.
export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/engineering/technical-queries/${encodeURIComponent(id)}/close`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      // An explicit empty object, not nothing: a PUT declaring a JSON content-type with no body at
      // all is rejected by the body parser before the acceptance rule is ever reached, and the
      // caller sees a parse error where it should see who is allowed to accept an answer.
      body: '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
