import { apiBase, authHeader } from '@/lib/api';

// Closing an incident now carries a mandatory root cause (0229). The body is forwarded rather than
// dropped — the API refuses a close without one, and the UI needs that refusal to reach the user.
export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/hse/incidents/${id}/close`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
