import { apiBase, authHeader } from '@/lib/api';

// BFF: generate the client-facing CRM quotation from the tender's priced BOQ.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/quotation`, {
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
