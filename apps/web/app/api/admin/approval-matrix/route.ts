import { apiBase, authHeader } from '@/lib/api';

// BFF: read + replace the approval matrix for an entity type.
export async function GET(request: Request): Promise<Response> {
  const et = new URL(request.url).searchParams.get('entityType') ?? 'purchase-request';
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/approval-matrix?entityType=${encodeURIComponent(et)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Approval API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/approval-matrix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Approval API unreachable' }, { status: 502 });
  }
}
