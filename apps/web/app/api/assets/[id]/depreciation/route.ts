import { apiBase, authHeader } from '@/lib/api';

// BFF: straight-line depreciation schedule for an asset.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const qs = new URL(request.url).searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/assets/${id}/depreciation?${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
