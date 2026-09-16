import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Where a conveyance's distribution stands: who was addressed, who has answered, who has not.
// Reported per person rather than as one status — "the Buyer has it, Site has not" is the fact a
// document controller chases on, and a single flag destroys it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/doccontrol/transmittals/${encodeURIComponent(id)}/receipt`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'DocControl API unreachable' }, { status: 502 });
  }
}
