import { apiBase, authHeader } from '@/lib/api';

// BFF: forward invoice creation to the Nest Finance API server-side (with identity).
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    reference?: unknown;
    value?: unknown;
    poId?: unknown;
    poTitle?: unknown;
    supplierName?: unknown;
    projectId?: unknown;
    projectName?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/invoices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
        reference: typeof body.reference === 'string' ? body.reference : undefined,
        value: typeof body.value === 'number' ? body.value : 0,
        poId: typeof body.poId === 'string' ? body.poId : null,
        poTitle: typeof body.poTitle === 'string' ? body.poTitle : null,
        supplierName: typeof body.supplierName === 'string' ? body.supplierName : null,
        projectId: typeof body.projectId === 'string' ? body.projectId : null,
        projectName: typeof body.projectName === 'string' ? body.projectName : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
