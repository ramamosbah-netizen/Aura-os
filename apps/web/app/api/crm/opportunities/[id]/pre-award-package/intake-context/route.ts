import { apiBase, apiFetch, authHeader } from '@/lib/api';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/crm/opportunities/${encodeURIComponent(id)}/pre-award-package/intake-context`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await result.json(), { status: result.status });
  } catch {
    return Response.json({ error: 'Sales intake context unavailable' }, { status: 502 });
  }
}
