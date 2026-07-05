import { apiBase, authHeader } from '@/lib/api';

// BFF: forward the universal inbox to the Nest API server-side (keeps the bearer token
// off the client). Consumed by the command palette's "Pending" group.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/inbox`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(res.ok ? await res.json() : []);
  } catch {
    return Response.json([]);
  }
}
