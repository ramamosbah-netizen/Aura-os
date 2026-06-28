import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  try {
    const res = await fetch(`${apiBase()}/api/v1/audit?${searchParams.toString()}`, {
      method: 'GET',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Audit API unreachable' }, { status: 502 });
  }
}
