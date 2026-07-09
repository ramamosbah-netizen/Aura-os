import { apiBase, authHeader } from '@/lib/api';

// BFF: business calendars CRUD (Admin Center phase 2).
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/calendar`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Calendar API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/calendar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Calendar API unreachable' }, { status: 502 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/calendar?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Calendar API unreachable' }, { status: 502 });
  }
}
