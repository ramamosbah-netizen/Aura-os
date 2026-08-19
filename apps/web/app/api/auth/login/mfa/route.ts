import { apiBase } from '@/lib/api';
import { storeSession } from '@/lib/auth-session';

// BFF: answer an `mfa` challenge with the authenticator code. Same contract as the password
// step — the exchange is the only thing that mints a session.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { challengeId?: unknown; code?: unknown };
  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/login/mfa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: typeof body.challengeId === 'string' ? body.challengeId : undefined,
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
      return Response.json({ error: data.message ?? data.error ?? 'that code was not accepted' }, { status: res.ok ? 401 : res.status });
    }
    await storeSession(data.token, data.expiresIn);
    return Response.json({ user: data.user ?? null });
  } catch {
    return Response.json({ error: 'auth service unreachable' }, { status: 502 });
  }
}
