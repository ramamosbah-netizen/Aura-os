import { apiFetch, apiBase, authHeader } from '@/lib/api';

// Permit 360 read — the permit with the risk assessment that authorises it. A GET forwarder is
// needed (not just server-side getJson) so the 360 page can refresh itself after a transition
// without a full navigation, and so the browser E2E can drive the same path a user does.
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/hse/ptws/${id}/detail`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
