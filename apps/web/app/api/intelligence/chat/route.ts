import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    history?: unknown;
    page?: unknown;
  };

  const message = typeof body.message === 'string' ? body.message : '';
  if (!message.trim()) {
    return Response.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/v1/intelligence/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        message,
        history: Array.isArray(body.history) ? body.history : undefined,
        page: body.page && typeof body.page === 'object' ? body.page : undefined,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return Response.json({ error: d.error ?? `Error ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: 'Intelligence service unreachable' }, { status: 502 });
  }
}
