import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Every answer this query has had that was later replaced, oldest first. Kept because site builds
// to a TQ answer: "what were we told in March" has to stay answerable after June's answer exists.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/engineering/technical-queries/${encodeURIComponent(id)}/responses`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
