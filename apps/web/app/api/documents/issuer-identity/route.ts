import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the issuing company's identity for a printed document (F-01). A static segment, so it is not
// read as a document id by the [id] routes beside it.
export async function GET(request: Request): Promise<Response> {
  const companyId = new URL(request.url).searchParams.get('companyId');
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/documents/issuer-identity${query}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ message: 'Documents API unreachable' }, { status: 502 });
  }
}
