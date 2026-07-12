import { apiBase, authHeader } from '@/lib/api';

// BFF: Contact 360 — the full stakeholder command-center payload in one fetch.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/contacts/${id}/summary`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
