import { type NextRequest } from 'next/server';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; responsibilityId: string; action: string }> },
): Promise<Response> {
  const { id, responsibilityId, action } = await params;
  if (!['accept', 'start', 'complete'].includes(action)) return Response.json({ error: 'Unknown action' }, { status: 400 });
  try {
    const response = await apiFetch(
      `${apiBase()}/api/v1/projects/${id}/responsibilities/${responsibilityId}/${action}`,
      { method: 'POST', headers: await authHeader(), cache: 'no-store' },
    );
    return Response.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
