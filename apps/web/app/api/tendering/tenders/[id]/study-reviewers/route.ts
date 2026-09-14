import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/study-reviewers`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Tender reviewer directory unavailable' }, { status: 502 }); }
}
