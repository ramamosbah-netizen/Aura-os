import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

// BFF: execute or reject an autonomy proposal.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  try {
    const { id, action } = await params;
    if (action !== 'execute' && action !== 'reject') {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
    const res = await fetch(`${apiBase()}/api/v1/intelligence/proposals/${id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Intelligence API unreachable' }, { status: 502 });
  }
}
