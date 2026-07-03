import { apiBase, authHeader } from '@/lib/api';

// BFF: forward PO creation to the Nest Procurement API server-side (with identity).
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    reference?: unknown;
    value?: unknown;
    supplierName?: unknown;
    projectId?: unknown;
    projectName?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/purchase-orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
        reference: typeof body.reference === 'string' ? body.reference : undefined,
        value: typeof body.value === 'number' ? body.value : 0,
        supplierName: typeof body.supplierName === 'string' ? body.supplierName : null,
        projectId: typeof body.projectId === 'string' ? body.projectId : null,
        projectName: typeof body.projectName === 'string' ? body.projectName : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
