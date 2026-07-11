import { apiBase, authHeader } from '@/lib/api';

// BFF: save one BOQ item's resource breakdown (compiles + prices the line).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const { id, itemId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders/${id}/pricing/items/${itemId}`, {
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
