import { apiBase, authHeader } from '@/lib/api';

// Drawing workflow-command forwarder (G-32). One thin proxy for every state-machine command —
// the backend enforces the transition; this only whitelists the verb and forwards the body.
const COMMANDS = new Set(['submit', 'start-review', 'review', 'revise', 'transmit', 'close']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown drawing command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/engineering/drawings/${id}/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Engineering API unreachable' }, { status: 502 });
  }
}
