import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

// BFF: remove a project team member (revoke the project-scoped grant). Needs ?roleId=.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<Response> {
  const { id, userId } = await params;
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/${id}/members/${userId}${qs}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
