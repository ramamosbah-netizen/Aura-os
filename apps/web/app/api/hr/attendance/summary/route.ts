import { apiBase, authHeader } from '@/lib/api';

// BFF: attendance summary (day-counts by status + total hours) over a date range.
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  try {
    const res = await fetch(`${apiBase()}/api/v1/hr/attendance/summary?${qs}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : {}, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({}, { status: 502 });
  }
}
