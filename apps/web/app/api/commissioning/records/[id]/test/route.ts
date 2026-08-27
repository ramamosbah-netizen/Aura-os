import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Record a test pass/total against a commissioning record.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    pointsPassed?: number;
    pointsTotal?: number;
    testDate?: string;
    remarks?: string;
  };

  if (body.pointsPassed == null) {
    return Response.json({ error: 'pointsPassed required' }, { status: 400 });
  }

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/test`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
