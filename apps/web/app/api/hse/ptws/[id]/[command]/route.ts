import { apiBase, authHeader } from '@/lib/api';

// Permit-to-work command forwarder (G-08 residue). One thin proxy for the state-machine verbs the
// backend added in 0229 — approve and close keep their own static routes. The API enforces the
// transition and the three approval gates; this only whitelists the verb and forwards the body.
const COMMANDS = new Set(['request', 'reject', 'reopen', 'expire']);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown permit command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/hse/ptws/${id}/${command}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'HSE API unreachable' }, { status: 502 });
  }
}
