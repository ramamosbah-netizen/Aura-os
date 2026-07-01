import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    vehicleId?: string;
    latitude?: number;
    longitude?: number;
    speed?: number;
    odometer?: number;
    recordedAt?: string;
  };

  if (!body.vehicleId || body.latitude === undefined || body.longitude === undefined || body.speed === undefined) {
    return Response.json({ error: 'vehicleId, latitude, longitude and speed are required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/fleet/telemetry/webhook`, {
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
