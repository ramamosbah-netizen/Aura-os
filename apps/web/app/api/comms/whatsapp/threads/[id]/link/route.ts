import { apiFetch, apiBase, authHeader, replayHeaders } from '@/lib/api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const response = await apiFetch(`${apiBase()}/api/v1/whatsapp/threads/${encodeURIComponent(id)}/link`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) }, body: await request.text() });
    return Response.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return Response.json({ error: 'WhatsApp API unreachable' }, { status: 502 });
  }
}
