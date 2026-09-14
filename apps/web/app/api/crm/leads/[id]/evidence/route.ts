import { apiBase, apiFetch, authHeader } from '@/lib/api';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/crm/leads/${encodeURIComponent(id)}/evidence`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await result.json(), { status: result.status });
  } catch {
    return Response.json({ error: 'Enquiry documents service unavailable' }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/crm/leads/${encodeURIComponent(id)}/evidence`, {
      method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store',
    });
    return Response.json(await result.json(), { status: result.status });
  } catch {
    return Response.json({ error: 'Enquiry document upload failed' }, { status: 502 });
  }
}
