import { apiFetch, apiBase, authHeader } from '@/lib/api';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/study-files`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await result.json(), { status: result.status });
  } catch { return Response.json({ error: 'Study file service unavailable' }, { status: 502 }); }
}
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  try {
    const result = await apiFetch(`${apiBase()}/api/v1/tendering/tenders/${encodeURIComponent(id)}/study-files`, {
      method: 'POST', headers: await authHeader(), body: await request.formData(), cache: 'no-store',
    });
    return Response.json(await result.json(), { status: result.status });
  } catch { return Response.json({ error: 'Upload failed. Please retry.' }, { status: 502 }); }
}
