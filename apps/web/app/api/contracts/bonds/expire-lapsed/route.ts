import { apiBase, authHeader } from '@/lib/api';

// BFF: sweep bonds whose expiry has passed into 'expired' — the register's self-correction.

export async function POST(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/bonds/expire-lapsed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
