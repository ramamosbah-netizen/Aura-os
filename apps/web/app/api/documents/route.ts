import { apiBase, authHeader } from '@/lib/api';

// BFF: kernel DMS documents. Read-only here — the list is filtered server-side to what the
// caller may actually see (DmsService.listFor), so this proxy adds no authorisation of its own
// and must not be given any: one gate, in the kernel.

export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
