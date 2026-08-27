import { type NextRequest } from 'next/server';
import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: assignable delivery roles + active users for the project add-member form (P1).

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/projects/${id}/assignable`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => ({ roles: [], users: [] }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
