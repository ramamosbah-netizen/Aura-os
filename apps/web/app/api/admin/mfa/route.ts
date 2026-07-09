import { apiBase, authHeader } from '@/lib/api';

// BFF: admin MFA reset — remove a user's TOTP enrolment (device loss / offboarding).
export async function DELETE(request: Request): Promise<Response> {
  const account = new URL(request.url).searchParams.get('account') ?? '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/auth/mfa?account=${encodeURIComponent(account)}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Auth API unreachable' }, { status: 502 });
  }
}
