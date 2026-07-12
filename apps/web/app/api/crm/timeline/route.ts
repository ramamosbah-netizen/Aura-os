import { apiBase, authHeader } from '@/lib/api';

// BFF: Unified Timeline — merged event + activity feed for one CRM record.

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/timeline${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
