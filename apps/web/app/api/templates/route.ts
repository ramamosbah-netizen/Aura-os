import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category');

  const query = new URLSearchParams();
  if (category) query.append('category', category);

  try {
    const res = await fetch(`${apiBase()}/api/templates?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Templates API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    category?: unknown;
    elements?: unknown;
  };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';

  if (!name) return Response.json({ error: 'name required' }, { status: 400 });
  if (!category) return Response.json({ error: 'category required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/templates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        name,
        category,
        elements: Array.isArray(body.elements) ? body.elements : [],
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Templates API unreachable' }, { status: 502 });
  }
}
