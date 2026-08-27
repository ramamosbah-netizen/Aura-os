import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: compliance authorities (G-20). Reference data — SIRA, DCD and whoever comes next are rows
// here, registered by hand. The list is empty on a fresh install by design: no regulatory fact is
// shipped un-sourced.
export async function GET(): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/authorities`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/authorities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}
