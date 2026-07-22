import { apiBase, authHeader } from '@/lib/api';

// BFF: list accounts — feeds the customer select-or-create on the quotation create flow. Filtered
// server-side to what the caller may see; this proxy adds no logic of its own.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}

// BFF: forward account creation to the Nest CRM API server-side. The body is
// passed through as-is — the API's CreateAccountDto is the validator, so the
// BFF never silently drops fields the domain has since grown (it used to
// whitelist 4 fields and swallowed the whole commercial profile).
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return Response.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
