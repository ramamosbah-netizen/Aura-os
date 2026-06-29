import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    vehicleId?: string;
    date?: string;
    liters?: number;
    cost?: number;
    odometer?: number;
  };

  if (!body.vehicleId || !body.date || !body.liters || !body.cost || body.odometer === undefined) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/fleet/fuel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Fleet API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/fleet/fuel`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Fleet API unreachable' }, { status: 502 });
  }
}
