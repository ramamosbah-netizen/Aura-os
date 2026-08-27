import { apiFetch, apiBase, authHeader } from '@/lib/api';
export async function GET(): Promise<Response> { try { const r = await apiFetch(`${apiBase()}/api/v1/whatsapp/threads`, { headers: await authHeader(), cache: 'no-store' }); return Response.json(await r.json().catch(() => []), { status: r.status }); } catch { return Response.json({ error: 'WhatsApp API unreachable' }, { status: 502 }); } }
