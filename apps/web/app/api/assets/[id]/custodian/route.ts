import { apiBase, apiFetch, authHeader } from '@/lib/api';

// Hand an asset to an employee, or take it back by sending no employee. The API owns the rules —
// who may do it, and that the employee is a real active one — so this only carries the request.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await props.params;
  const body = (await request.json().catch(() => ({}))) as { employeeId?: string | null };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/assets/${encodeURIComponent(id)}/custodian`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ employeeId: body.employeeId ?? null }),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
