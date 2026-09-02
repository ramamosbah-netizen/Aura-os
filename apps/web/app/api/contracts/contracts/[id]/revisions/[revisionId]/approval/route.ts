import { NextResponse } from 'next/server';
import { apiBase, apiFetch, authHeader } from '@/lib/api';
export async function GET(_request: Request,{params}:{params:Promise<{id:string;revisionId:string}>}){const {id,revisionId}=await params;try{const r=await apiFetch(`${apiBase()}/api/v1/contracts/contracts/${id}/revisions/${revisionId}/approval`,{headers:await authHeader(),cache:'no-store'});return new NextResponse(r.body,{status:r.status,headers:{'content-type':'application/json'}});}catch{return NextResponse.json({error:'Contracts API unreachable'},{status:502});}}
