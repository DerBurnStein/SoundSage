// Clears the demo cookie and redirects home. Either the user is about
// to sign in for real (in which case NextAuth's flow takes over) or they
// just want to leave the demo state so the landing prompts re-appear.

import { NextResponse } from 'next/server';
import { DEMO_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Same fix as /demo/start — Cloud Run's container sees 0.0.0.0:8080 in
// req.url, which the browser can't follow. Use NEXTAUTH_URL.
function publicOrigin(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

export function GET(): NextResponse {
  // Manual Set-Cookie header (same reasoning as /demo/start).
  // Max-Age=0 with empty value tells the browser to delete the cookie.
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${DEMO_COOKIE}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
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
