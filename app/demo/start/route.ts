// Sets the `soundsage_demo` cookie and redirects to the dashboard. Visitors
// hitting this URL get a populated dashboard backed by the public demo
// user record without signing in. The auth wrapper in lib/auth.ts reads
// the cookie and returns a synthetic session pointing at DEMO_USER_ID.
//
// Cookie set via the `cookies()` API from `next/headers` rather than
// `NextResponse.cookies.set()` — the latter has a known issue where
// the Set-Cookie header doesn't always propagate on redirect responses
// (the cookie was silently dropped, server-side logs confirmed only
// NextAuth's csrf/callback cookies were ever received). The
// next/headers cookies() API attaches the cookie to the outgoing
// response reliably regardless of how the response is constructed.

import { NextResponse } from 'next/server';
import { DEMO_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Resolve the public origin for the redirect. On Cloud Run, `req.url`
// contains the container's internal bind address (0.0.0.0:8080), so a
// raw `new URL('/', req.url)` produces a redirect the browser can't
// follow. NEXTAUTH_URL is set to the public domain in prod and the
// existing Spotify callback uses the same pattern.
function publicOrigin(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

export function GET(): NextResponse {
  // Build the Set-Cookie header by hand and attach it to a manually-
  // constructed NextResponse. Both NextResponse.cookies.set() and
  // cookies().set() from next/headers were silently dropping the
  // cookie on this redirect response in our Next.js 14 / Cloud Run
  // environment — Cloud Run logs confirmed the cookie never reached
  // the browser. Writing the header directly is the reliable path.
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${DEMO_COOKIE}=1`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];
  if (isProd) parts.push('Secure');
  const setCookie = parts.join('; ');

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: new URL('/', publicOrigin()).toString(),
      'Set-Cookie': setCookie,
      'Cache-Control': 'no-store',
    },
  });
}
