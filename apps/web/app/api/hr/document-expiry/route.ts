import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/document-expiry${qs ? `?${qs}` : ''}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(null, { status: 502 });
  }
}
