import { apiBase, authHeader } from '@/lib/api';

// BFF: document evidence requirements — what a decision needs, and whether it has been produced.
// Separate from /api/documents: a requirement is an obligation on a business record, a document
// is a file. The API keeps them apart and so does this.

export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/document-requirements${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ requirements: [], readiness: null }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'requirements API unreachable' }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/document-requirements/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'requirements API unreachable' }, { status: 502 });
  }
}
