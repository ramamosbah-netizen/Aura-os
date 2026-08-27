import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: approve + run a real autonomy proposal.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/admin/platform/ai/autonomy/proposals/${id}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Platform API unreachable' }, { status: 502 });
  }
}
