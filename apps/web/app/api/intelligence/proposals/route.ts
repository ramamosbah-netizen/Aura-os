import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

// BFF: list autonomy proposals or create a new one.
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const status = req.nextUrl.searchParams.get('status') ?? '';
    const qs = status ? `?status=${status}` : '';
    const res = await fetch(`${apiBase()}/api/v1/intelligence/proposals${qs}`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const res = await fetch(`${apiBase()}/api/v1/intelligence/proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}
