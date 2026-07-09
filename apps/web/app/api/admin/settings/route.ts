import { apiBase, authHeader } from '@/lib/api';

// BFF: list / set / remove tenant settings.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/settings`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Settings API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Settings API unreachable' }, { status: 502 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/settings?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Settings API unreachable' }, { status: 502 });
  }
}
