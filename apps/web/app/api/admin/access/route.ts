import { apiBase, authHeader } from '@/lib/api';

// BFF: roles + grants overview from the Access admin API.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/access`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Access API unreachable' }, { status: 502 });
  }
}
