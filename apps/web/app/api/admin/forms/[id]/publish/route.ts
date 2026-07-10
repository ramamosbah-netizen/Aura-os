import { apiBase, authHeader } from '@/lib/api';

// BFF: Form Designer P2 — promote the draft design to the live (published) form.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/forms/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Forms API unreachable' }, { status: 502 });
  }
}
