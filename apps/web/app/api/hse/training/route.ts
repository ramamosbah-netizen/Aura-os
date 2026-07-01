import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    workerName?: string;
    workerId?: string;
    inductionDate?: string;
    cardNumber?: string;
    cardExpiry?: string;
    certifications?: string[];
  };

  if (!body.workerName || !body.workerId || !body.inductionDate) {
    return Response.json({ error: 'workerName, workerId and inductionDate are required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/hse/training`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/hse/training`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
