import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session';

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
  if (!isPublic && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
