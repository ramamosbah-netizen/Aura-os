import { apiBase, authHeader } from '@/lib/api';

// Site daily-report command forwarder (G-34). POST verbs for the state machine + line-items; the
// backend enforces the transition + the draft-only guard. (`submit` keeps its own PUT route.)
const COMMANDS = new Set(['start-review', 'approve', 'reject', 'labour', 'plant', 'progress', 'delays', 'evidence']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown site-report command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/site/daily-reports/${id}/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Site API unreachable' }, { status: 502 });
  }
}
