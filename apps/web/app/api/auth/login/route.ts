import { cookies } from 'next/headers';
import { apiBase } from '../../../../lib/api';
import { SESSION_COOKIE } from '../../../../lib/session';

// Login BFF: forward credentials to the API, then store the returned token in an
// httpOnly cookie. The token never touches client JS.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  try {
    const res = await fetch(`${apiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: typeof body.username === 'string' ? body.username : undefined,
        password: typeof body.password === 'string' ? body.password : undefined,
      }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: unknown;
      message?: string;
      error?: string;
    };
    if (!res.ok || !data.token) {
      return Response.json({ error: data.message ?? data.error ?? 'login failed' }, { status: res.status || 401 });
    }
    const store = await cookies();
    store.set(SESSION_COOKIE, data.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
    return Response.json({ user: data.user ?? null });
  } catch {
    return Response.json({ error: 'auth service unreachable' }, { status: 502 });
  }
}
