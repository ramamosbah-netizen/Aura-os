import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * Per system on the project: Quality's published template, the approved checklist revision, and
 * whether each commissioning record is bound to it (TC-08/TC-09). A system with no approved
 * checklist is shown as not ready — never hidden, never treated as ready.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 });
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/commissioning/records/checklist-coverage?projectId=${encodeURIComponent(projectId)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Commissioning API unreachable' }, { status: 502 });
  }
}
