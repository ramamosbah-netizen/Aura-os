import { type NextRequest } from 'next/server';
import { apiBase, apiFetch, authHeader } from '@/lib/api';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const response = await apiFetch(`${apiBase()}/api/v1/projects/${id}/responsibilities`, {
      headers: await authHeader(), cache: 'no-store',
    });
    return Response.json(await response.json().catch(() => []), { status: response.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const response = await apiFetch(`${apiBase()}/api/v1/projects/${id}/responsibilities`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(await request.json().catch(() => ({}))), cache: 'no-store',
    });
    return Response.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
