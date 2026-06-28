import { apiBase, authHeader } from '@/lib/api';

// BFF: forward GRN creation to the Nest Inventory API server-side (with identity).
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
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
    const res = await fetch(`${apiBase()}/api/inventory/grns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
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
    return Response.json({ error: 'Inventory API unreachable' }, { status: 502 });
  }
}
