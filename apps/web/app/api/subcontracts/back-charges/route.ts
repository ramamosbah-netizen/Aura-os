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
    const res = await fetch(`${apiBase()}/api/v1/subcontracts/back-charges?${query.toString()}`, {
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
    category?: unknown;
    description?: unknown;
    grossAmount?: unknown;
    markupPercent?: unknown;
  };

  const subcontractId = typeof body.subcontractId === 'string' ? body.subcontractId : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const grossAmount = typeof body.grossAmount === 'number' ? body.grossAmount : Number(body.grossAmount) || 0;

  if (!subcontractId) return Response.json({ error: 'subcontractId required' }, { status: 400 });
  if (!description) return Response.json({ error: 'description required' }, { status: 400 });
  if (!(grossAmount > 0)) return Response.json({ error: 'grossAmount must be positive' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts/back-charges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        subcontractId,
        category: typeof body.category === 'string' ? body.category : undefined,
        description,
        grossAmount,
        markupPercent: typeof body.markupPercent === 'number' ? body.markupPercent : Number(body.markupPercent) || 0,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
