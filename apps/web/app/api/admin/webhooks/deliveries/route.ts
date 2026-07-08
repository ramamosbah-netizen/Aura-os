import { apiBase, authHeader } from '@/lib/api';

// BFF: recent webhook delivery log.
export async function GET(request: Request): Promise<Response> {
  const sub = new URL(request.url).searchParams.get('subscriptionId');
  const q = sub ? `?subscriptionId=${encodeURIComponent(sub)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/integration/webhooks/deliveries${q}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Integration API unreachable' }, { status: 502 });
  }
}
