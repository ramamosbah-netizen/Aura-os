import { apiBase, authHeader } from '@/lib/api';

// BFF: disabled business modules for this tenant — the sidebar hides them (Module Manager).
export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/workspace/modules`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({ disabled: [] })), { status: res.status });
  } catch {
    return Response.json({ disabled: [] }, { status: 200 }); // fail open — nav stays complete
  }
}
