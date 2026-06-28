import { apiBase, authHeader } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const res = await fetch(`${apiBase()}/api/finance/bank-transactions/${id}/unreconcile`, {
      method: 'POST',
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Bank transaction unreconcile API unreachable' }, { status: 502 });
  }
}
