import { apiFetch, apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  const { id, documentId } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/study-files/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store',
    });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Tender evidence revision upload failed' }, { status: 502 }); }
}
