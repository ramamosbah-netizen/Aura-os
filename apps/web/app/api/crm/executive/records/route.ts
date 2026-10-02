import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: F-06 — the exact deals behind one figure of the executive read. Only the drill's own
// parameters are passed on.

const PARAMS = ['days', 'asOf', 'by', 'outcome', 'reason', 'name', 'accountId'] as const;

export async function GET(req: Request): Promise<Response> {
  const incoming = new URL(req.url).searchParams;
  const qs = new URLSearchParams();
  for (const key of PARAMS) {
    const value = incoming.get(key);
    if (value !== null) qs.set(key, value);
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/executive/records?${qs.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
