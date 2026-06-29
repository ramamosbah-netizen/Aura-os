import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
    approvedDays?: unknown;
    revisedCompletionDate?: unknown;
  };

  const status = typeof body.status === 'string' ? body.status : '';
  if (!status) return Response.json({ error: 'status required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/projects/eot-claims/${id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        status,
        approvedDays: typeof body.approvedDays === 'number' ? body.approvedDays : Number(body.approvedDays) || 0,
        revisedCompletionDate: typeof body.revisedCompletionDate === 'string' ? body.revisedCompletionDate : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
