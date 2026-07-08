import { apiBase, authHeader } from '@/lib/api';

// BFF: operations / health metrics snapshot.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/ops`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Ops API unreachable' }, { status: 502 });
  }
}
