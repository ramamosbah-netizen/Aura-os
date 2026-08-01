import { apiBase, authHeader } from '@/lib/api';

// The distribution/revision history of a register entry (which transmittals conveyed each rev).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/doccontrol/register/${id}/history`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Doc Control API unreachable' }, { status: 502 });
  }
}
