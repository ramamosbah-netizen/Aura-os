import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const subcontractId = request.nextUrl.searchParams.get('subcontractId');
  const query = new URLSearchParams();
  if (subcontractId) query.append('subcontractId', subcontractId);

  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts/back-charges/summary?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
