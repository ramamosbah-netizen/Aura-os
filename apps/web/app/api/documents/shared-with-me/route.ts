import { apiBase, authHeader } from '@/lib/api';

// BFF: documents other people have shared with the caller. Static segment so Next matches it
// before the dynamic `[id]` route — otherwise "shared-with-me" would be read as a document id.
// No authorisation here: the kernel resolves the caller's shares. One gate, in the kernel.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/documents/shared-with-me`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'DMS API unreachable' }, { status: 502 });
  }
}
