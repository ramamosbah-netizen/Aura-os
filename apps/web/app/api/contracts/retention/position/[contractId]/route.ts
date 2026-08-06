import { apiBase, authHeader } from '@/lib/api';

// BFF: the retention position for a contract — held / released / pending / releasable.

export async function GET(_req: Request, { params }: { params: Promise<{ contractId: string }> }): Promise<Response> {
  const { contractId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/retention/position/${contractId}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
