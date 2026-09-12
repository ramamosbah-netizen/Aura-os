import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Remove an as-built link (TC-GATE-8).
 *
 * The drawing is untouched — only T&C's statement that it documents this system goes away. Unlike
 * the dossier manifest, which records what was SENT and cannot be edited, a link is a statement
 * about the present: one made in error has to be retractable, or the wrong drawing would stand
 * behind an as-built claim forever.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
): Promise<Response> {
  const { id, linkId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/asbuilt-links/${linkId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
