import { apiBase, authHeader } from '@/lib/api';

// BFF: variation impact roll-up (original → approved additions/omissions → revised value).

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/variations/summary/${projectId}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
