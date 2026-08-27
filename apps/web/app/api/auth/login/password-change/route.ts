import { apiFetch, apiBase } from '@/lib/api';
import { storeSession } from '@/lib/auth-session';

// BFF: answer a `password_change` challenge — the second half of sign-in for an account whose
// password an administrator set. Exchanging the challenge is what issues the session, so the
// cookie is written here exactly as the password step writes it.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { challengeId?: unknown; newPassword?: unknown };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/auth/login/password-change`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        challengeId: typeof body.challengeId === 'string' ? body.challengeId : undefined,
        newPassword: typeof body.newPassword === 'string' ? body.newPassword : undefined,
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
    // A change can hand back ANOTHER challenge (MFA still owed) — pass it on rather than
    // treating a tokenless success as a failure.
    if (res.ok && data.challenge && data.challengeId) {
      return Response.json({ challenge: data.challenge, challengeId: data.challengeId });
    }
    if (!res.ok || !data.token) {
      return Response.json(
        { error: data.message ?? data.error ?? 'could not set the new password' },
        { status: res.ok ? 401 : res.status },
      );
    }
    await storeSession(data.token, data.expiresIn);
    return Response.json({ user: data.user ?? null });
  } catch {
    return Response.json({ error: 'auth service unreachable' }, { status: 502 });
  }
}
