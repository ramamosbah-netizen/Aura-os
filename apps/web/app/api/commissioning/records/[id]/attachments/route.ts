import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * The browser's door to commissioning attachments — and commissioning's first one of any kind.
 *
 * Every multipart route in this app was in CRM, Tendering, DocControl, Site and Quality, so a
 * witnessed test could carry no instrument printout, no photograph of the installed device and no
 * calibration certificate. The JSON command routes beside this cannot carry a file: they read
 * `request.json()`.
 *
 * `authHeader()` and nothing else — the API decides whether this person may attach test evidence
 * (`commissioning.record.test`, declared on the route), and the BFF never widens that.
 */
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(
      `${apiBase()}/api/v1/commissioning/records/${encodeURIComponent(id)}/attachments`,
      { method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store' },
    );
    // The refusal body matters as much as the acceptance: the file-type policy explains WHY a file
    // was rejected, and swallowing it would leave the engineer with "upload failed".
    const data = await result.json().catch(() => ({ error: 'Attachment upload failed' }));
    return Response.json(data, { status: result.status });
  } catch {
    return Response.json({ error: 'Commissioning attachment upload unavailable' }, { status: 502 });
  }
}
