import { apiBase, authHeader } from '@/lib/api';

// BFF: replenishment watch-list — stock items at/below their reorder level.
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/inventory/stock/reorder`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : { lines: [], count: 0 }, { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json({ lines: [], count: 0 }, { status: 502 });
  }
}
