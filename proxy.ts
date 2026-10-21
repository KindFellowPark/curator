import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { isAllowed } from '@/lib/allowlist';

/**
 * Deny by default. The matcher below excludes only the auth routes themselves, the
 * two public gate pages, and static assets; everything else — every page and every API
 * route — requires an allowlisted session.
 *
 * This is a second gate, not the only one. API routes and the shell layout re-check
 * independently, because this is a routing concern and a route that is ever reached by
 * another path (a rewrite, a future edge case) must not be defenceless.
 *
 * File is `proxy.ts`, not `middleware.ts`: Next 16 deprecated the middleware convention.
 */
export default auth((req) => {
  const email = req.auth?.user?.email;
  if (isAllowed(email)) return NextResponse.next();

  const url = new URL(req.nextUrl.origin);
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  url.pathname = '/signin';
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ['/((?!api/auth|signin|denied|_next/static|_next/image|favicon.ico).*)'],
};
