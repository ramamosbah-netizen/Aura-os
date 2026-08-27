import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: approve a risk assessment (draft → approved).

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/hse/risk-assessments/${id}/approve`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
