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

  // Exchange code for tokens. Failures here are usually a redirect_uri
  // mismatch on Spotify's side — surface as a clean error redirect
  // instead of a 500 stack trace.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(
      code,
      pkce.verifier,
      process.env.SPOTIFY_REDIRECT_URI!
    );
  } catch (err) {
    logger.warn(
      { err: String(err), userId: pkce.userId },
      'Spotify callback: token exchange failed'
    );
    home.searchParams.set('spotify', 'token_exchange_failed');
    return NextResponse.redirect(home);
  }

  // Fetch Spotify user profile. A 403 here is the most common cause of
  // OAuth failures: when the Spotify app is in Development Mode (the
  // default for new dev apps), only Spotify accounts on the explicit
  // test-user list can call /me — every other account gets tokens but
  // 403s on every API call. We surface this as a specific error code
  // so the dashboard can render an actionable message instead of a
  // generic "something went wrong."
  let spotifyUser: SpotifyUser;
  try {
    spotifyUser = await spotifyGet<SpotifyUser>('/me', tokens.access_token);
  } catch (err) {
    const msg = String(err);
    const isForbidden = msg.includes('403');
    logger.warn(
      { err: msg, userId: pkce.userId, isForbidden },
      'Spotify callback: /me lookup failed'
    );
    home.searchParams.set(
      'spotify',
      isForbidden ? 'not_authorized_account' : 'profile_fetch_failed'
    );
    return NextResponse.redirect(home);
  }

  const profileImage = spotifyUser.images?.[0]?.url ?? null;

  // Persist encrypted tokens + profile metadata
  await db.spotifyAccount.upsert({
    where: { userId: pkce.userId },
    create: {
      userId: pkce.userId,
      spotifyUserId: spotifyUser.id,
      displayName: spotifyUser.display_name,
      imageUrl: profileImage,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope,
      needsReconnect: false,
      failureCount: 0,
    },
    update: {
      spotifyUserId: spotifyUser.id,
      displayName: spotifyUser.display_name,
      imageUrl: profileImage,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope,
      needsReconnect: false,
      failureCount: 0,
    },
  });

  logger.info({ userId: pkce.userId, spotifyUserId: spotifyUser.id }, 'Spotify connected');

  // Fire-and-forget: prime the dashboard with Spotify-side aggregates so the
  // user sees populated Tracks/Artists/Patterns tabs immediately instead of
  // waiting weeks for raw events to accumulate. Bootstrap takes ~2-4s for
  // 6 endpoint calls — well under the time the user spends getting back to
  // the dashboard, so the snapshot is usually written before first render.
  // Failures are logged but don't block the connect flow.
  import('@/lib/spotify-bootstrap')
    .then(({ bootstrapTopItems }) => bootstrapTopItems(pkce.userId))
    .catch((err) =>
      logger.warn({ userId: pkce.userId, err: String(err) }, 'Top-items bootstrap failed (non-fatal)')
    );

  // Redirect back to the app origin (NEXTAUTH_URL = localhost in dev, real domain in prod).
  // We can't redirect to req.url's origin here because Spotify sent us to 127.0.0.1
  // but the user's session lives on localhost (or the production domain).
  const appBase = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return NextResponse.redirect(new URL('/?spotify=connected', appBase));
}
