import { apiBase, apiFetch, authHeader } from '@/lib/api';

// The next few weeks of a programme, derived by the API on every read. `?weeks=` chooses the
// length; the API clamps a nonsensical one rather than trusting it.
export async function GET(
  request: Request,
  props: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await props.params;
  const weeks = new URL(request.url).searchParams.get('weeks')?.trim();
  try {
    const res = await apiFetch(
      `${apiBase()}/api/v1/projects/schedules/${encodeURIComponent(projectId)}/look-ahead${weeks ? `?weeks=${encodeURIComponent(weeks)}` : ''}`,
      { headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
