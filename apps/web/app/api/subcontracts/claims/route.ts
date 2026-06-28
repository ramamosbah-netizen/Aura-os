import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const subcontractId = searchParams.get('subcontractId');
  const status = searchParams.get('status');

  const query = new URLSearchParams();
  if (subcontractId) query.append('subcontractId', subcontractId);
  if (status) query.append('status', status);

  try {
    const res = await fetch(`${apiBase()}/api/subcontracts/claims?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    subcontractId?: unknown;
    workCompletedValue?: unknown;
    isRetentionRelease?: unknown;
    retentionReleased?: unknown;
  };

  const subcontractId = typeof body.subcontractId === 'string' ? body.subcontractId : '';
  const workCompletedValue = typeof body.workCompletedValue === 'number' ? body.workCompletedValue : Number(body.workCompletedValue) || 0;
  const isRetentionRelease = typeof body.isRetentionRelease === 'boolean' ? body.isRetentionRelease : false;
  const retentionReleased = typeof body.retentionReleased === 'number' ? body.retentionReleased : Number(body.retentionReleased) || 0;

  if (!subcontractId) return Response.json({ error: 'subcontractId required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/subcontracts/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ subcontractId, workCompletedValue, isRetentionRelease, retentionReleased }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
