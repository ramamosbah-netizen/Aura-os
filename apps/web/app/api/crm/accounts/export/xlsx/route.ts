import { apiBase, authHeader } from '@/lib/api';

// BFF: stream the accounts register as an Excel download.

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/export.xlsx`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="crm-accounts.xlsx"',
      },
    });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
