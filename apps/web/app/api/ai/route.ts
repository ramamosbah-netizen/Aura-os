import { apiBase, authHeader } from '../../../lib/api';

// Backend-for-frontend: the browser posts here (same origin); we forward to the
// NestJS AI endpoint server-side. Keeps the API URL (and any future key) off the client.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; system?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/ai/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ prompt, system: typeof body.system === 'string' ? body.system : undefined }),
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json({ error: `AI API returned ${res.status}` }, { status: 502 });
    }
    return Response.json(await res.json());
  } catch {
    return Response.json({ error: 'AI service unreachable' }, { status: 502 });
  }
}
