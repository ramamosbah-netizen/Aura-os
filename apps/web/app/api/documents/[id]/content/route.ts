import { apiBase, authHeader } from '@/lib/api';

// BFF: stream a document's bytes. The kernel checks DOWNLOAD against the document before it hands
// over a single byte — the content is not reachable by holding a storage key — so this proxy
// carries the caller's identity through and relays whatever the kernel returns (a 403 included).
// It passes the body through rather than buffering, and preserves the filename the kernel set.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const url = new URL(_req.url);
  const version = url.searchParams.get('version');
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/${id}/content${version ? `?version=${version}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    if (!res.ok || !res.body) {
      return Response.json({ error: 'not available' }, { status: res.status || 502 });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      },
    });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
