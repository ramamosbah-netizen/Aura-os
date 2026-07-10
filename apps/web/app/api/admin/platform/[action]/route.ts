import { apiBase, authHeader } from '@/lib/api';

// BFF: platform admin — notification routing status (GET notifications) and
// demo-data seed (POST seed-demo). Admin Center phase 2 §2.8/§2.9.

const GETS = new Set(['notifications', 'ai', 'data-lifecycle', 'security', 'workflows']);
const POSTS = new Set(['seed-demo', 'archive-run']);

export async function GET(_req: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  if (!GETS.has(action)) return Response.json({ error: 'not found' }, { status: 404 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/platform/${action}`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Platform API unreachable' }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  if (!POSTS.has(action)) return Response.json({ error: 'not found' }, { status: 404 });
  const body = await req.text().catch(() => '');
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/platform/${action}`, {
      method: 'POST',
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(await authHeader()) },
      ...(body ? { body } : {}),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Platform API unreachable' }, { status: 502 });
  }
}
