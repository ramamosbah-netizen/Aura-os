import { apiBase, authHeader } from '@/lib/api';

/**
 * BFF passthrough for the mail workspace.
 *
 * One catch-all rather than a file per verb: the mailbox surface is a dozen routes that all do the
 * same thing — forward the caller's session to the API and hand back exactly what it said. Writing
 * twelve near-identical files invites them to drift, and the status code is what the UI reads to
 * tell a refusal from an empty folder.
 *
 * No credential ever reaches the browser: the token is attached here, server-side.
 */
const ALLOWED = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

async function forward(request: Request, path: string[], method: string): Promise<Response> {
  if (!ALLOWED.has(method)) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const search = new URL(request.url).search;
  const target = `${apiBase()}/api/v1/comms/mailbox/${path.map(encodeURIComponent).join('/')}${search}`;
  const body = method === 'GET' || method === 'DELETE'
    ? undefined
    : JSON.stringify(await request.json().catch(() => ({})));
  try {
    const res = await fetch(target, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Mail API unreachable' }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return forward(request, (await ctx.params).path, 'GET');
}
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return forward(request, (await ctx.params).path, 'POST');
}
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return forward(request, (await ctx.params).path, 'PATCH');
}
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return forward(request, (await ctx.params).path, 'DELETE');
}
