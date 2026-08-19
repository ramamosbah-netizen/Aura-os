import { apiBase } from '@/lib/api';
import { storeSession } from '@/lib/auth-session';

/**
 * Login BFF: forward credentials to the API, then store the returned token in an httpOnly
 * cookie. The token never touches client JS.
 *
 * A CHALLENGE is not a failure. The API answers 200 with `{challenge, challengeId}` when a
 * second step is required (MFA, or a password an administrator set that must be changed) and
 * issues no token. This used to be flattened into `{error:'login failed'}` — at HTTP **200**,
 * because the status was copied from the API — so the page read `res.ok`, called it a success
 * and navigated; the middleware then bounced the session-less browser back to /login. An
 * administrator could set someone's password and that person could never sign in, with nothing
 * on screen to say why. The challenge is passed through for the client to answer instead.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: unknown;
    password?: unknown;
    code?: unknown;
  };
  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: typeof body.username === 'string' ? body.username : undefined,
        password: typeof body.password === 'string' ? body.password : undefined,
        code: typeof body.code === 'string' ? body.code : undefined,
      }),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: unknown;
      expiresIn?: number;
      challenge?: string;
      challengeId?: string;
      message?: string;
      error?: string;
    };
    if (res.ok && data.challenge && data.challengeId) {
      return Response.json({ challenge: data.challenge, challengeId: data.challengeId });
    }
    if (!res.ok || !data.token) {
      return Response.json({ error: data.message ?? data.error ?? 'login failed' }, { status: res.ok ? 401 : res.status });
    }
    await storeSession(data.token, data.expiresIn);
    return Response.json({ user: data.user ?? null });
  } catch {
    return Response.json({ error: 'auth service unreachable' }, { status: 502 });
  }
}
