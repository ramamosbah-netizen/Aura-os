import { apiBase, authHeader } from '@/lib/api';

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/schedules/${projectId}/baseline`, {
      method: 'POST',
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
