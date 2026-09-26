import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the tender's Technical Compliance Matrix — live verdicts, issued revisions, and whether the reader may issue (EST-12).

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/compliance-matrix`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
