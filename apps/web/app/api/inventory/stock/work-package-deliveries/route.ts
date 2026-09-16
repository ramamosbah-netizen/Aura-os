import { type NextRequest } from 'next/server';
import { apiFetch, apiBase, authHeader } from '@/lib/api';

/**
 * BFF: what material reached a project's work packages (`BUY-07`).
 *
 * `wbs` is passed through as the caller sent it — the packages being asked about. The server credits
 * a package only where a movement named it; nothing here resolves a destination from a BOQ item.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const query = new URLSearchParams();
  const projectId = searchParams.get('projectId');
  const wbs = searchParams.get('wbs');
  if (projectId) query.append('projectId', projectId);
  if (wbs) query.append('wbs', wbs);

  try {
    const res = await apiFetch(`${apiBase()}/api/v1/inventory/stock/work-package-deliveries?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Inventory API unreachable' }, { status: 502 });
  }
}
