import { apiBase, authHeader } from '@/lib/api';

// BFF: record an authority inspection's outcome.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await req.text();
  try {
    const res = await fetch(`${apiBase()}/api/v1/compliance/inspections/${id}/outcome`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}
