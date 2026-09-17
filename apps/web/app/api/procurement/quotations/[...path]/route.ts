import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * BFF for the quotation capture surface (QC-01).
 *
 * A single proxy rather than six near-identical route files, because every one of them would do the
 * same thing: attach the caller's identity and forward. It is scoped to
 * `procurement/quotations/**` and forwards only the verbs that surface uses, so it cannot become a
 * general tunnel into the API.
 *
 * It forwards and returns. No shaping, no defaults, no validation of its own — the API owns what a
 * quotation may say, and a second opinion here is a second place for the two to disagree.
 */
const ALLOWED = new Set(['GET', 'POST', 'PATCH']);

async function proxy(request: Request, path: string[]): Promise<Response> {
  if (!ALLOWED.has(request.method)) {
    return Response.json({ error: `${request.method} is not available on this surface` }, { status: 405 });
  }
  const search = new URL(request.url).search;
  const target = `${apiBase()}/api/v1/procurement/quotations/${path.map(encodeURIComponent).join('/')}${search}`;
  const body = request.method === 'GET' ? undefined : await request.text();

  try {
    const res = await apiFetch(target, {
      method: request.method,
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
export async function POST(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
export async function PATCH(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
