import { type NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { encrypt } from '@/lib/crypto';
import { exchangeCodeForTokens, spotifyGet, type SpotifyUser } from '@/lib/spotify';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  const home = new URL('/', req.url);

  if (errorParam === 'access_denied') {
    home.searchParams.set('spotify', 'denied');
    return NextResponse.redirect(home);
  }

  if (!code || !state) {
    home.searchParams.set('spotify', 'error');
    return NextResponse.redirect(home);
  }

  // Look up PKCE data from Redis. This avoids the cross-origin cookie problem:
  // the user initiated the flow on localhost:3000 but Spotify redirects here
  // (127.0.0.1:3000), so cookies set on localhost are not present.
  const raw = await redis.get(`spotify_pkce:${state}`);
  if (!raw) {
    logger.warn('Spotify callback: PKCE state not found or expired');
    home.searchParams.set('spotify', 'error');
    return NextResponse.redirect(home);
  }

  let pkce: { verifier: string; userId: string };
  try {
    pkce = JSON.parse(raw) as typeof pkce;
  } catch {
    home.searchParams.set('spotify', 'error');
    return NextResponse.redirect(home);
  }

  // Delete immediately — one-time use
  await redis.del(`spotify_pkce:${state}`);

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(
    code,
    pkce.verifier,
    process.env.SPOTIFY_REDIRECT_URI!
  );

  // Fetch Spotify user profile
  const spotifyUser = await spotifyGet<SpotifyUser>('/me', tokens.access_token);

  // Persist encrypted tokens
  await db.spotifyAccount.upsert({
    where: { userId: pkce.userId },
    create: {
      userId: pkce.userId,
      spotifyUserId: spotifyUser.id,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope,
      needsReconnect: false,
      failureCount: 0,
    },
    update: {
      spotifyUserId: spotifyUser.id,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope,
      needsReconnect: false,
      failureCount: 0,
    },
  });

  logger.info({ userId: pkce.userId, spotifyUserId: spotifyUser.id }, 'Spotify connected');

  // Redirect back to the app origin (NEXTAUTH_URL = localhost in dev, real domain in prod).
  // We can't redirect to req.url's origin here because Spotify sent us to 127.0.0.1
  // but the user's session lives on localhost (or the production domain).
  const appBase = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return NextResponse.redirect(new URL('/?spotify=connected', appBase));
}
