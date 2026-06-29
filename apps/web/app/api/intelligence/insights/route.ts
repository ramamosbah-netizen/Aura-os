import { apiBase, authHeader } from '@/lib/api';

// BFF: trigger an AI briefing on the Nest Intelligence API server-side.
export async function POST(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/intelligence/insights`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}
