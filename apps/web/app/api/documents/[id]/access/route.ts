import { apiBase, authHeader } from '@/lib/api';

// BFF: what the caller may do with one document, each permission carrying its sources. Feeds the
// "who can see this / why can I share this" view. Authorisation is the kernel's; this only relays.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/${id}/access`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
