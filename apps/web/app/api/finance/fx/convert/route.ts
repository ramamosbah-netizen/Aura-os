import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const qs = new URL(request.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/fx/convert${qs}`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
