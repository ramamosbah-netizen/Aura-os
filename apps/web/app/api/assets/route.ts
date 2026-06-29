import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    serialNumber?: string;
    category?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    status?: string;
    warrantyExpiry?: string | null;
    nextCalibrationDate?: string | null;
    nextInspectionDate?: string | null;
  };

  if (!body.name || !body.serialNumber || !body.category || !body.purchaseDate) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/assets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/assets`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
