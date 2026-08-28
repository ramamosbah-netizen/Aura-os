import { apiFetch, apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['GET', 'POST', 'PATCH']);
async function forward(request: Request, path: string[], method: string): Promise<Response> {
  if (!ALLOWED.has(method)) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const body = method === 'GET' ? undefined : JSON.stringify(await request.json().catch(() => ({})));
  const target = `${apiBase()}/api/v1/comms/meetings/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
  try {
    const result = await apiFetch(target, { method, body, cache: 'no-store', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()) } });
    return Response.json(await result.json().catch(() => ({})), { status: result.status });
  } catch { return Response.json({ error: 'Meetings API unreachable' }, { status: 502 }); }
}
type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, ctx: Ctx) { return forward(request, (await ctx.params).path, 'GET'); }
export async function POST(request: Request, ctx: Ctx) { return forward(request, (await ctx.params).path, 'POST'); }
export async function PATCH(request: Request, ctx: Ctx) { return forward(request, (await ctx.params).path, 'PATCH'); }
