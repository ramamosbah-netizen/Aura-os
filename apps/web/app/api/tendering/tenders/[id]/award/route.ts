import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: governed tender award evidence capture. The API owns award validation and persistence;
// this route only forwards the authenticated browser request and preserves the upstream status.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${id}/award`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
