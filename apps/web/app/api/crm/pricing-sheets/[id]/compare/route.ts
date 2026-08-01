import { apiBase, authHeader } from '@/lib/api';

// BFF: version comparison for a pricing sheet — vs its frozen parent by default (?with= overrides).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets/${id}/compare${qs}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => null), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
