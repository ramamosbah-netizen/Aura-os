import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: a case's append-only children — submissions, inspections, decisions, certificates.
// Allowlisted rather than open-proxied, so a typo cannot become an arbitrary upstream call.
const CHILDREN = new Set(['submissions', 'inspections', 'decisions', 'certificates']);

async function forward(id: string, child: string, init?: RequestInit): Promise<Response> {
  if (!CHILDREN.has(child)) return Response.json({ error: 'not found' }, { status: 404 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/cases/${id}/${child}`, {
      ...init,
      headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; child: string }> }): Promise<Response> {
  const { id, child } = await params;
  return forward(id, child);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; child: string }> }): Promise<Response> {
  const { id, child } = await params;
  return forward(id, child, { method: 'POST', body: await req.text() });
}
