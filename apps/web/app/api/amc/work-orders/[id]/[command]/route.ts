import { apiBase, authHeader } from '@/lib/api';

// Work-order command forwarder (G-08 residue). `assign` and `complete` keep their own static
// routes; these are the lifecycle verbs added alongside migration 0230. The API enforces the
// transition and the contract gate — this only whitelists the verb and forwards the body.
const COMMANDS = new Set(['start', 'cancel']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown work order command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/amc/work-orders/${id}/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'AMC Work Order API unreachable' }, { status: 502 });
  }
}
