import { apiFetch, apiBase, authHeader } from '@/lib/api';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/studies`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Tender study service unavailable' }, { status: 502 }); }
}
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/studies`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Tender study service unavailable' }, { status: 502 }); }
}
