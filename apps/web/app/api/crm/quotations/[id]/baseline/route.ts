import { apiBase, authHeader } from '@/lib/api';

// BFF: the locked Commercial Baseline (approved-price snapshot) for a quotation, or null.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/quotations/${id}/baseline`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
