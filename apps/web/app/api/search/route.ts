import { apiBase, authHeader } from '@/lib/api';

// BFF: forward global search to the Nest API server-side (keeps the bearer token off the client).
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (!q.trim()) return Response.json([]);
  try {
    const res = await fetch(`${apiBase()}/api/v1/search?q=${encodeURIComponent(q)}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(res.ok ? await res.json() : []);
  } catch {
    return Response.json([]);
  }
}
