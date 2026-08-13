import { apiBase, authHeader } from '@/lib/api';

// Incident investigation-command forwarder (0229). `close` keeps its own static route because it
// carries the mandatory root cause; these are the rest of the lifecycle.
const COMMANDS = new Set(['investigate', 'reopen']);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown incident command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/hse/incidents/${id}/${command}`, {
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
