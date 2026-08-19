import { cookies } from 'next/headers';
import { apiBase } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/session';

// Revoke the API token first, then clear the browser cookie even if the API is unavailable.
export async function POST(): Promise<Response> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await fetch(`${apiBase()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch {
      // Local cookie removal is still required; the server token expires independently.
    }
  }
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
