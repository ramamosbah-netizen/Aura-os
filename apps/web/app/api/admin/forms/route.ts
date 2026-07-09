import { apiBase, authHeader } from '@/lib/api';

// BFF: Form Designer — list designable schemas with override counts.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/forms`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Forms API unreachable' }, { status: 502 });
  }
}
