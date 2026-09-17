import { apiFetch, apiBase, authHeader } from '@/lib/api';

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
    currency?: unknown;
    invoiceDate?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/finance/invoices`, {
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
        // Forwarded, not defaulted. An unforwarded currency silently became AED, which meant the
        // screen could not express a foreign-currency invoice at all — and could not be refused
        // for one either (FX-01).
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : undefined,
        invoiceDate: typeof body.invoiceDate === 'string' && body.invoiceDate.trim() ? body.invoiceDate.trim() : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
