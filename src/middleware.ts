import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * Validate Origin/Referer header to prevent CSRF and unauthorized cross-origin API access.
 * Only enforced on mutating requests (POST/PUT/DELETE/PATCH) to API routes.
 * GET/HEAD/OPTIONS are allowed without Origin (browser same-origin GET has no Origin header).
 */
function validateOrigin(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith('/api/')) return null;

  const method = request.method;
  // Only check mutating methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Determine the server's own host
  // Priority: X-Forwarded-Host (behind proxy) > Host (direct)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';

  // Determine protocol
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const proto = forwardedProto || (request.nextUrl.protocol.replace(':', ''));

  const serverOrigin = `${proto}://${host}`;

  // Check Origin header (preferred)
  if (origin) {
    if (origin === serverOrigin) return null; // OK - same origin
    // Origin present but doesn't match - reject
    console.warn(`[Security] Blocked cross-origin ${method} ${pathname}: Origin=${origin}, expected=${serverOrigin}`);
    return NextResponse.json(
      { error: 'Forbidden: cross-origin request blocked' },
      { status: 403 }
    );
  }

  // No Origin header - check Referer as fallback
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      if (refererOrigin === serverOrigin) return null; // OK - same origin via Referer
      console.warn(`[Security] Blocked cross-origin ${method} ${pathname}: Referer=${refererOrigin}, expected=${serverOrigin}`);
      return NextResponse.json(
        { error: 'Forbidden: cross-origin request blocked' },
        { status: 403 }
      );
    } catch {
      // Malformed Referer - reject
      return NextResponse.json(
        { error: 'Forbidden: invalid referer' },
        { status: 403 }
      );
    }
  }

  // No Origin and no Referer - allow (e.g., curl, internal tools, same-origin fetch with certain configs)
  return null;
}

export default function middleware(request: NextRequest) {
  // 1. Security: validate Origin on API mutations
  const securityResponse = validateOrigin(request);
  if (securityResponse) return securityResponse;

  // 2. i18n routing
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(en|zh)/:path*', '/api/:path*'],
};
