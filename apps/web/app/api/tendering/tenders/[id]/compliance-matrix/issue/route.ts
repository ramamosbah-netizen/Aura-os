import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the Technical Manager issues the matrix — rendered and filed by the server (EST-12).

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/compliance-matrix/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
