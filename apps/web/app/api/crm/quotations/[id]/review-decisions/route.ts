import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: every time this offer was returned for revision, by whom and why — append-only, oldest first.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/review-decisions`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
