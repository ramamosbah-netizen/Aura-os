import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Record an attributed waiver against a persisted evidence requirement. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/document-requirements/${encodeURIComponent(id)}/waive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'requirements API unreachable' }, { status: 502 });
  }
}
