import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/fleet/vehicles/check-expiry`, {
      method: 'POST',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Fleet API unreachable' }, { status: 502 });
  }
}
