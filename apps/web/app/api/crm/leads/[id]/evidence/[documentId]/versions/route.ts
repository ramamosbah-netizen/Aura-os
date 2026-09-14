import { apiBase, apiFetch, authHeader } from '@/lib/api';

type Context = { params: Promise<{ id: string; documentId: string }> };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id, documentId } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/crm/leads/${encodeURIComponent(id)}/evidence/${encodeURIComponent(documentId)}/versions`, {
      method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store',
    });
    return Response.json(await result.json(), { status: result.status });
  } catch {
    return Response.json({ error: 'Enquiry document revision upload failed' }, { status: 502 });
  }
}
