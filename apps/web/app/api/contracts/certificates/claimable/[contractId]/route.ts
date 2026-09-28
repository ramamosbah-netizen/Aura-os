import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: J5-02 — what a certificate on this contract may claim: the frozen award items of its project,
// each with its unit, rate, installed and certified quantities and what is still eligible.
export async function GET(_request: Request, { params }: { params: Promise<{ contractId: string }> }): Promise<Response> {
  const { contractId } = await params;
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/contracts/certificates/claimable/${encodeURIComponent(contractId)}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
