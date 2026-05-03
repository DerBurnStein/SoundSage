import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { requireAuth } from '@/lib/session';
import { redis } from '@/lib/redis';

const SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-email',
  'user-library-read', // for liked songs / saved tracks
].join(' ');

export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  // Generate PKCE code verifier (43–128 URL-safe chars)
  const verifier = randomBytes(48).toString('base64url').slice(0, 96);

  // Compute code challenge: base64url(sha256(verifier))
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  // CSRF state token
  const state = randomBytes(24).toString('hex');

  // Store verifier + userId in Redis keyed by state (10-min TTL).
  // Using Redis instead of a cookie avoids the cross-origin problem:
  // the user is on localhost:3000 but Spotify redirects to 127.0.0.1:3000,
  // and cookies don't cross those host boundaries.
  await redis.set(
    `spotify_pkce:${state}`,
    JSON.stringify({ verifier, userId: session.userId }),
    'EX',
    600
  );

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  return NextResponse.json({ url });
}
