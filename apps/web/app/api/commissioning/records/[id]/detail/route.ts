import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * One system's 360 payload — record, test sheet, run lineage and punch list (TC-GATE-2).
 *
 * The `/commissioning/[id]` page reads this server-side; this route exists so the workspace can read
 * the same payload from the CLIENT when a system is expanded in place, rather than the two surfaces
 * assembling the same picture from different calls and drifting.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/${id}/detail`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
