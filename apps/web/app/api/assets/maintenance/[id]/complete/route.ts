import { apiBase, authHeader } from '@/lib/api';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    actualCost?: number;
  };

  if (body.actualCost === undefined) {
    return Response.json({ error: 'Missing actualCost' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/assets/maintenance/${id}/complete`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
