import { NextRequest, NextResponse } from 'next/server';
import { apiBase, apiFetch, authHeader, replayHeaders } from '@/lib/api';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await params;
  const body = await request.text();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/contracts/contracts/${id}/revisions/${revisionId}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) }, body, cache: 'no-store',
    });
    return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch { return NextResponse.json({ error: 'Contracts API unreachable' }, { status: 502 }); }
}
