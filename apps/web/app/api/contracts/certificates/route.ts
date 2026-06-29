import { apiBase, authHeader } from '@/lib/api';

// BFF: list + create interim payment certificates (IPCs).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const contractId = url.searchParams.get('contractId');
  const status = url.searchParams.get('status');
  const qs = new URLSearchParams();
  if (contractId) qs.set('contractId', contractId);
  if (status) qs.set('status', status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/certificates${suffix}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : [], { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/certificates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
