import { redis } from './redis';
import logger from './logger';

// ─── Error types ──────────────────────────────────────────────────────────────

export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

export class SpotifyRateLimitError extends Error {
  retryAfter: number;
  constructor(message: string, retryAfter = 60) {
    super(message);
    this.name = 'SpotifyRateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ─── Rate limiter (sliding window, ~3 req/s = 180/min per app) ───────────────

const RATE_KEY = 'spotify:global_calls';
const RATE_LIMIT = 180;
const RATE_WINDOW = 60; // seconds

async function checkRateLimit(): Promise<void> {
  const count = await redis.incr(RATE_KEY);
  if (count === 1) await redis.expire(RATE_KEY, RATE_WINDOW);
  if (count > RATE_LIMIT) {
    const ttl = await redis.ttl(RATE_KEY);
    logger.warn({ count, ttl }, 'Spotify global rate limit hit');
    throw new SpotifyRateLimitError('Global rate limit hit', ttl);
  }
}

// ─── Typed Spotify API responses ──────────────────────────────────────────────

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email: string;
}

export interface SpotifyRecentlyPlayedItem {
  track: { id: string; name: string; artists: { id: string; name: string }[] };
  played_at: string; // ISO 8601
}

export interface SpotifyRecentlyPlayed {
  items: SpotifyRecentlyPlayedItem[];
  cursors?: { before: string; after: string };
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

const BASE = 'https://api.spotify.com/v1';

export async function spotifyGet<T>(path: string, accessToken: string): Promise<T> {
  await checkRateLimit();

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'SoundSage/1.0',
    },
    cache: 'no-store',
  });

  if (res.status === 401) {
    throw new SpotifyAuthError('Access token expired or revoked');
  }

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    logger.warn({ path, retryAfter }, 'Spotify 429 — retrying after backoff');
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyGet<T>(path, accessToken); // single retry
  }

  if (!res.ok) {
    throw new Error(`Spotify API ${res.status} on ${path}`);
  }

  return res.json() as Promise<T>;
}

// ─── App-level token (Client Credentials) ────────────────────────────────────
// Used for endpoints that work with shared/global data (e.g. /artists).
// Cached in-process until 60s before expiry. Single token is shared across
// all requests in this process.

let cachedAppToken: { value: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAppToken && cachedAppToken.expiresAt > now + 60_000) {
    return cachedAppToken.value;
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify client_credentials failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAppToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// ─── Token exchange (used in PKCE callback) ───────────────────────────────────

export interface SpotifyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<SpotifyTokenResponse> {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify token exchange failed ${res.status}: ${body}`);
  }

  return res.json() as Promise<SpotifyTokenResponse>;
}
