import { apiBase, authHeader } from '@/lib/api';

// BFF: the assigned-user directory the admin manages.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/workspace/users`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : [], { status: res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}
