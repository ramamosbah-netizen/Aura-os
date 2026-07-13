import { apiBase, authHeader } from '@/lib/api';

// BFF: Forecast snapshots — GET slippage history, POST captures a new snapshot.

export async function GET(request: Request): Promise<Response> {
  const limit = new URL(request.url).searchParams.get('limit');
  try {
    const qs = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/forecast/history${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}

export async function POST(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/opportunities/forecast/snapshot`, {
      method: 'POST',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
