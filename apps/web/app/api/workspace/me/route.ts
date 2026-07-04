import { apiBase, authHeader } from '@/lib/api';

// BFF: the current user's effective workspace view (role + allowed functions).
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/workspace/me`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : {}, { status: res.status });
  } catch {
    return Response.json({ error: 'Workspace API unreachable' }, { status: 502 });
  }
}
