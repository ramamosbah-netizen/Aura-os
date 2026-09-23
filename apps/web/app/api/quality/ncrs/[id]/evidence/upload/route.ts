import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * The browser's door to NCR evidence.
 *
 * The JSON command route beside this cannot carry a file: it reads `request.json()`. Without this
 * a non-conformance could carry no photograph of the thing that was wrong, and the sign-off pad on
 * the screen had nowhere to send its stroke.
 *
 * `authHeader()` and nothing else — the API decides whether this person may evidence an NCR
 * (`quality.ncr.correct`, declared on the route), and the BFF never widens that.
 */
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(
      `${apiBase()}/api/v1/quality/ncrs/${encodeURIComponent(id)}/evidence/upload`,
      { method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store' },
    );
    const data = await result.json().catch(() => ({ error: 'Evidence upload failed' }));
    return Response.json(data, { status: result.status });
  } catch {
    return Response.json({ error: 'NCR evidence upload unavailable' }, { status: 502 });
  }
}
