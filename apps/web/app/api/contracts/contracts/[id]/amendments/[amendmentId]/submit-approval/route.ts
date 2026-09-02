import { NextResponse } from 'next/server';
import { apiBase, apiFetch, authHeader } from '@/lib/api';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; amendmentId: string }> }) {
  const { id, amendmentId } = await params;
  try { const r = await apiFetch(`${apiBase()}/api/v1/contracts/contracts/${id}/amendments/${amendmentId}/submit-approval`, { method:'POST', headers: await authHeader(), cache:'no-store' }); return new NextResponse(r.body,{status:r.status,headers:{'content-type':'application/json'}}); }
  catch { return NextResponse.json({error:'Contracts API unreachable'},{status:502}); }
}
