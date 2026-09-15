import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }): Promise<Response> {
  const { id: projectId, bookingId } = await params;
  try {
    const response = await apiFetch(`${apiBase()}/api/v1/projects/${encodeURIComponent(projectId)}/resource-bookings/${encodeURIComponent(bookingId)}/release`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: await request.text(), cache: 'no-store',
    });
    return Response.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
