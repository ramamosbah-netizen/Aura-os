import { apiBase, apiFetch, authHeader } from '@/lib/api';

/**
 * BFF for Settings → Company Policies → Quotation Approval (EST-17).
 *
 * One proxy for the overview, the drafts, validation, preview, activation and retirement, scoped to
 * `admin/company-policies/quotation-approval/**`. It forwards the caller's identity and returns what
 * the API says: the API holds the policy, validates it and refuses a change without a reason, so a
 * second check here would only be a second place for the two to disagree.
 */
const ALLOWED = new Set(['GET', 'POST', 'PUT']);

async function proxy(request: Request, path: string[] | undefined): Promise<Response> {
  if (!ALLOWED.has(request.method)) {
    return Response.json({ error: `${request.method} is not available on this surface` }, { status: 405 });
  }
  const rest = (path ?? []).map(encodeURIComponent).join('/');
  const target = `${apiBase()}/api/v1/admin/company-policies/quotation-approval${rest ? `/${rest}` : ''}`;
  const body = request.method === 'GET' ? undefined : await request.text();
  try {
    const res = await apiFetch(target, {
      method: request.method,
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body,
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Company policy API unreachable' }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
export async function POST(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
export async function PUT(request: Request, { params }: Ctx) { return proxy(request, (await params).path); }
