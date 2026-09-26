import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: two revisions of one offer side by side — computed by the server from the immutable records.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const withId = new URL(request.url).searchParams.get('with') ?? '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/compare?with=${encodeURIComponent(withId)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
