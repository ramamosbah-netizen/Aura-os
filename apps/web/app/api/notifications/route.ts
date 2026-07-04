import { apiBase, authHeader } from '@/lib/api';

// BFF: notification list for client-side refresh (the hub polls this).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/notifications${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'API unreachable' }, { status: 502 });
  }
}
