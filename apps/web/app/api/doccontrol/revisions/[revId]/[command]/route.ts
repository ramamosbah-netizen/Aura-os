import { apiBase, authHeader } from '@/lib/api';

// Document-revision workflow-command forwarder (G-33). The backend enforces the transition; this
// whitelists the verb and forwards the body.
const COMMANDS = new Set(['submit', 'start-review', 'approve', 'reject', 'issue', 'revise']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revId: string; command: string }> },
): Promise<Response> {
  const { revId, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown document command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/doccontrol/revisions/${revId}/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Document Control API unreachable' }, { status: 502 });
  }
}
