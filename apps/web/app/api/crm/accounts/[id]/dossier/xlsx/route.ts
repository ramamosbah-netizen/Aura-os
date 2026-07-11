import { apiBase, authHeader } from '@/lib/api';

// BFF: stream one customer's full dossier as a multi-sheet Excel download.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/${id}/dossier.xlsx`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="account-dossier-${id.slice(0, 8)}.xlsx"`,
      },
    });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
