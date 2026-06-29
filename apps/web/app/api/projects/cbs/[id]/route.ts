import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    category?: unknown;
    budgetAmount?: unknown;
    committedAmount?: unknown;
    actualAmount?: unknown;
    forecastAmount?: unknown;
    notes?: unknown;
  };

  const payload: any = {};
  if (typeof body.title === 'string') payload.title = body.title;
  if (typeof body.category === 'string') payload.category = body.category;
  if (typeof body.budgetAmount === 'number') payload.budgetAmount = body.budgetAmount;
  if (typeof body.committedAmount === 'number') payload.committedAmount = body.committedAmount;
  if (typeof body.actualAmount === 'number') payload.actualAmount = body.actualAmount;
  if (typeof body.forecastAmount === 'number') payload.forecastAmount = body.forecastAmount;
  if (typeof body.notes === 'string') payload.notes = body.notes;

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/cbs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/cbs/${id}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
