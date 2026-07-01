import { apiBase, authHeader } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemIndex: string }> },
): Promise<Response> {
  const { id, itemIndex } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/audits/${id}/checklist/${itemIndex}/ncr`, {
      method: 'POST',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
