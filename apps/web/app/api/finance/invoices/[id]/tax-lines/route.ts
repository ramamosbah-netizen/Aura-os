import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/finance/invoices/${id}/tax-lines`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    taxCodeId?: unknown;
    taxableAmount?: unknown;
    isInclusive?: unknown;
  };

  const taxCodeId = typeof body.taxCodeId === 'string' ? body.taxCodeId : '';
  const taxableAmount = typeof body.taxableAmount === 'number' ? body.taxableAmount : Number(body.taxableAmount);

  if (!taxCodeId) return Response.json({ error: 'taxCodeId required' }, { status: 400 });
  if (isNaN(taxableAmount)) return Response.json({ error: 'taxableAmount required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/finance/invoices/${id}/tax-lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        taxCodeId,
        taxableAmount,
        isInclusive: typeof body.isInclusive === 'boolean' ? body.isInclusive : false,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
