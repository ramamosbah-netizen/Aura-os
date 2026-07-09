import { apiBase, authHeader } from '@/lib/api';

// BFF: toggle an AI guardrail rule (Admin Center §2.7).
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/platform/ai/guardrails/toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Platform API unreachable' }, { status: 502 });
  }
}
