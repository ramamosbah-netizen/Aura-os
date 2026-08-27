import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the renewal watch-list. Already-expired certificates stay on it — operating on a lapsed
// approval is the most urgent item here, not one that quietly drops off.
export async function GET(request: Request): Promise<Response> {
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/compliance/renewals${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Compliance API unreachable' }, { status: 502 });
  }
}
