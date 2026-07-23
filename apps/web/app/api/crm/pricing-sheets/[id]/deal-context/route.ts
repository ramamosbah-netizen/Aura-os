import { apiBase, authHeader } from '@/lib/api';

// BFF: opportunity-level Copilot facts for a sheet — descriptive counts, never invented scores.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/pricing-sheets/${id}/deal-context`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => null), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
