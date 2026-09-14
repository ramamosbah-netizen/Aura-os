import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const response = await apiFetch(`${apiBase()}/api/v1/crm/quotations/${encodeURIComponent(id)}/document-identity`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    return Response.json(body, { status: response.status });
  } catch {
    return Response.json({ message: 'Quotation identity service unreachable' }, { status: 502 });
  }
}
