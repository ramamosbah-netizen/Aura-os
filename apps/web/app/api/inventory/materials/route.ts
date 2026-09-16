import { type NextRequest } from 'next/server';
import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** The material catalogue a requisitioner picks from. */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const query = new URLSearchParams();
  const search = searchParams.get('search');
  // Only ACTIVE materials by default: the picker exists to raise new demand, and an obsolete
  // material would be offered and then refused by the server, which is a worse answer than not
  // offering it. Asking for another status explicitly still works.
  query.append('status', searchParams.get('status') ?? 'active');
  if (search) query.append('search', search);

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/materials?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory materials API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/materials`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      // Passed through verbatim: the API owns which fields a material needs, and re-listing them
      // here would be a second definition that drifts.
      body: (await request.text()) || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory materials API unreachable' }, { status: 502 });
  }
}
