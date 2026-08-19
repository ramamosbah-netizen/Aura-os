import { NextResponse, type NextRequest } from 'next/server';
import { decodeSessionUser, SESSION_COOKIE } from './lib/session';

/**
 * Optimistic auth gate — Next 16 Proxy (formerly Middleware). Real authorization is
 * enforced at the API; this only bounces anonymous users to /login when lockdown is on.
 * Opt-in via WEB_AUTH_REQUIRED so default/dev behavior is unchanged.
 */
export function proxy(request: NextRequest): NextResponse {
  if (process.env.WEB_AUTH_REQUIRED !== 'true') return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === '/login' || pathname.startsWith('/api/auth/') || pathname.startsWith('/_next');
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!isPublic && !decodeSessionUser(session)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(url);
    if (session) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
