import { apiFetch, apiBase, authHeader } from '@/lib/api';

/** Project-scoped read used while the UI waits for the durable release reactor to link DocControl. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });
  try {
    const response = await apiFetch(
      `${apiBase()}/api/v1/engineering/drawings/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
