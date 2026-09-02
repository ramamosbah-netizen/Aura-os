import { NextRequest, NextResponse } from 'next/server';
import { apiBase, apiFetch, authHeader, replayHeaders } from '@/lib/api';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const query = request.nextUrl.search || '';
    const res = await apiFetch(`${apiBase()}/api/v1/contracts/contracts/${id}/negotiation${query}`, { method: 'GET', headers: await authHeader(), cache: 'no-store' });
    return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch { return NextResponse.json({ error: 'Contracts API unreachable' }, { status: 502 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/contracts/contracts/${id}/negotiation`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) }, body, cache: 'no-store' });
    return new NextResponse(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch { return NextResponse.json({ error: 'Contracts API unreachable' }, { status: 502 }); }
}
