import { apiBase, authHeader } from '@/lib/api';

// BFF: stream the filtered audit-log CSV export (gap #10).
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/audit/export.csv${qs ? `?${qs}` : ''}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="audit-log.csv"',
      },
    });
  } catch {
    return Response.json({ error: 'Audit API unreachable' }, { status: 502 });
  }
}
