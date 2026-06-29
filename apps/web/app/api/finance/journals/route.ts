import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const reference = searchParams.get('reference');
  const query = reference ? `?reference=${reference}` : '';

  try {
    const res = await fetch(`${apiBase()}/api/finance/journals${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Journals API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    description?: unknown;
    reference?: unknown;
    lines?: unknown;
  };

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) return Response.json({ error: 'description required' }, { status: 400 });
  if (!Array.isArray(body.lines) || body.lines.length < 2) {
    return Response.json({ error: 'At least 2 balanced journal lines are required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/finance/journals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        description,
        reference: typeof body.reference === 'string' ? body.reference : undefined,
        lines: body.lines,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Journals API unreachable' }, { status: 502 });
  }
}
