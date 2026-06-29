import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const isActive = searchParams.get('isActive');

  const query = new URLSearchParams();
  if (isActive) query.append('isActive', isActive);

  try {
    const res = await fetch(`${apiBase()}/api/finance/tax-codes?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    code?: unknown;
    description?: unknown;
    rate?: unknown;
    taxType?: unknown;
  };

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const rate = typeof body.rate === 'number' ? body.rate : Number(body.rate);

  if (!code) return Response.json({ error: 'code required' }, { status: 400 });
  if (isNaN(rate)) return Response.json({ error: 'rate required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/finance/tax-codes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        code,
        description: typeof body.description === 'string' ? body.description : '',
        rate,
        taxType: typeof body.taxType === 'string' ? body.taxType : 'standard',
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
