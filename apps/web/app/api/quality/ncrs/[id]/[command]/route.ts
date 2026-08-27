import { apiFetch, apiBase, authHeader } from '@/lib/api';

// NCR workflow-command forwarder. The backend enforces the state transition; this whitelists the
// verb and forwards the body.
const COMMANDS = new Set(['plan', 'correct', 'verify']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; command: string }> },
): Promise<Response> {
  const { id, command } = await params;
  if (!COMMANDS.has(command)) {
    return Response.json({ error: `unknown NCR command '${command}'` }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/quality/ncrs/${id}/${command}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
