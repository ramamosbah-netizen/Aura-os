import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** BFF: the offers waiting for a technical verdict. Governed by `engineering.*` on the API. */
export async function GET(_request: Request, { params }: { params: Promise<{ quotationId: string }> }): Promise<Response> {
  const { quotationId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/procurement/quotation-lines/awaiting/${quotationId}`, {
      headers: await authHeader(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
