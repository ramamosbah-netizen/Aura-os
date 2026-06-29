import { apiBase, authHeader } from '@/lib/api';

// BFF: list calibrated rates or trigger a new calibration run.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/intelligence/calibrations`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}

export async function POST(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/intelligence/calibrations/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}
