import { apiBase, authHeader } from '@/lib/api';

// BFF: mark one mail read for the caller.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/comms/mail/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Comms API unreachable' }, { status: 502 });
  }
}
