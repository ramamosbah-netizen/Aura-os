import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type');
  const query = type ? `?type=${type}` : '';

  try {
    const res = await fetch(`${apiBase()}/api/finance/accounts${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Accounts API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    code?: unknown;
    name?: unknown;
    type?: unknown;
    parentId?: unknown;
  };

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';

  if (!code) return Response.json({ error: 'code required' }, { status: 400 });
  if (!name) return Response.json({ error: 'name required' }, { status: 400 });
  if (!type) return Response.json({ error: 'type required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/finance/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        code,
        name,
        type,
        parentId: typeof body.parentId === 'string' ? body.parentId : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Accounts API unreachable' }, { status: 502 });
  }
}
