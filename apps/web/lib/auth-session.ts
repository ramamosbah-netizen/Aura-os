import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './session';

/**
 * Write the session cookie exactly one way, whichever step of sign-in produced the token —
 * password, MFA answer, or a forced password change. Three copies of these flags would be
 * three chances for one of them to lose `httpOnly` without anyone noticing.
 */
export async function storeSession(token: string, expiresIn?: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Number.isInteger(expiresIn) && Number(expiresIn) > 0 ? Number(expiresIn) : 3600,
    priority: 'high',
  });
}
