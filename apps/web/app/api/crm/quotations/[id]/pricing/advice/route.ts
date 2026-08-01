import { apiBase, authHeader } from '@/lib/api';

// BFF: AI pricing review for a quotation. The findings are computed deterministically (margins,
// deviation from the Market Intelligence benchmark and past quotes); the narrative is added by a
// real AI provider when one is configured. Relayed as-is.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/quotations/${id}/pricing/advice`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
