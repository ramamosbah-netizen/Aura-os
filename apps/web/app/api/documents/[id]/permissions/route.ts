import { apiBase, authHeader } from '@/lib/api';

// BFF: who else has access to this document (the who-can-see-this list), and sharing it. Both
// require the caller to hold the right permission — enforced in the kernel, relayed here.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/${id}/permissions`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
