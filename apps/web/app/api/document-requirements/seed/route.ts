import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Create the canonical evidence checklist for one governed business record. */
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/document-requirements/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'requirements API unreachable' }, { status: 502 });
  }
}
