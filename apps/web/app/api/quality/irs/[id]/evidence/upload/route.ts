import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * The browser's door to inspection evidence — and quality's first one of any kind.
 *
 * Every multipart route in this app was in CRM, Tendering, DocControl and Site, so a QA engineer
 * could photograph an installation and had nowhere to put the photograph. The `[action]` forwarder
 * beside this cannot carry a file: it reads `request.json()`.
 *
 * `authHeader()` and nothing else — the API decides whether this person may attach inspection
 * evidence (`quality.ir.resolve`, declared on the route), and the BFF never widens that.
 */
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(
      `${apiBase()}/api/v1/quality/irs/${encodeURIComponent(id)}/evidence/upload`,
      { method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store' },
    );
    // The refusal body matters as much as the acceptance: the file-type policy explains WHY a
    // file was rejected, and swallowing it would leave the inspector with "upload failed".
    const data = await result.json().catch(() => ({ error: 'Evidence upload failed' }));
    return Response.json(data, { status: result.status });
  } catch {
    return Response.json({ error: 'Inspection evidence upload unavailable' }, { status: 502 });
  }
}
