import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * The browser's door to site evidence.
 *
 * `[id]/[command]` next door forwards JSON commands and cannot carry a file: it reads
 * `request.json()`. This one forwards the multipart body untouched, which is what lets a
 * photograph taken on site reach storage.
 *
 * `authHeader()` and nothing else — the API decides whether this person may attach evidence
 * (`site.daily-report.evidence`), and the BFF never widens that.
 */
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(
      `${apiBase()}/api/v1/site/daily-reports/${encodeURIComponent(id)}/evidence/upload`,
      { method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store' },
    );
    // The refusal body matters as much as the acceptance: the file-type policy explains WHY a
    // file was rejected, and swallowing it would leave the site engineer with "upload failed".
    const data = await result.json().catch(() => ({ error: 'Evidence upload failed' }));
    return Response.json(data, { status: result.status });
  } catch {
    return Response.json({ error: 'Site evidence upload unavailable' }, { status: 502 });
  }
}
