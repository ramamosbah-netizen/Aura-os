import { apiBase, authHeader } from '@/lib/api';

// BFF: generate the quote's lines from pricing-sheet items — the sheet-first authoring path. The
// API derives each line's sell price from its cost + margin and writes the lines; it refuses with
// 409 once the quote is approved. Relayed verbatim.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/quotations/${id}/pricing/generate-lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
