import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: the rows a register shows, returned as a native .xlsx built by the governed workbook (F-03).
// The API names what the file is — rows on screen, not necessarily the whole register — inside it.
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/documents/workbook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    if (!res.ok) return Response.json(await res.json().catch(() => ({})), { status: res.status });
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="export.xlsx"',
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return Response.json({ message: 'Documents API unreachable' }, { status: 502 });
  }
}
