import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Tenant-scoped quotation page contract used by the Quotations workspace. */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/crm/quotations/paged${query ? `?${query}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ error: 'Invalid quotation response' }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
