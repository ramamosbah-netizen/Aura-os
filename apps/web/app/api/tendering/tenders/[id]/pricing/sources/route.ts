import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: where each sourced component's supply price came from, and whether it is still what the
// supplier's offer says.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/pricing/sources`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
