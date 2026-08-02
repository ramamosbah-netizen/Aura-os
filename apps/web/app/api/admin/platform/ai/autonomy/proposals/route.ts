import { apiBase, authHeader } from '@/lib/api';

// BFF: the REAL autonomy proposal queue for the AI workspace (no fabricated data).
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/platform/ai/autonomy/proposals`, {
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ([])), { status: res.status });
  } catch {
    return Response.json({ error: 'Platform API unreachable' }, { status: 502 });
  }
}
