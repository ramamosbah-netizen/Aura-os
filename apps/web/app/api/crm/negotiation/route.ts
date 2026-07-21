import { apiBase, authHeader } from '@/lib/api';

// BFF: the negotiation log — what was asked, what was answered, what the competition was doing.
//
// The summary this returns computes price movement from the REVISION CHAIN, never from the log
// itself. A note claiming "gave them 5%" and a revision chain showing 2% disagree, and the chain
// is the one that bills.

export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/negotiation${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ entries: [], moves: [], summary: null }));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'negotiation API unreachable' }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/negotiation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'negotiation API unreachable' }, { status: 502 });
  }
}
