import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: whether a bid's supply scope is genuinely market-tested — per BOQ item, which suppliers count
// and which do not, and why. Computed by the API from procurement's own authorities; read-only.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get('comparisonDate');
  const qs = date ? `?comparisonDate=${encodeURIComponent(date)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/supply-coverage${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
