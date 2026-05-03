import { redis } from './redis';
import logger from './logger';

// ─── Response types ───────────────────────────────────────────────────────────

interface LastFmTag {
  name: string;
  url: string;
}

interface LastFmArtistImage {
  '#text': string;
  size: 'small' | 'medium' | 'large' | 'extralarge' | 'mega' | '';
}

interface LastFmArtistInfoResponse {
  artist?: {
    name: string;
    image?: LastFmArtistImage[];
    tags?: { tag: LastFmTag[] };
  };
  error?: number;
  message?: string;
}

// ─── Public type ──────────────────────────────────────────────────────────────

export interface LastFmArtistInfo {
  name: string;
  tags: string[];
  imageUrl: string | null;
}

// ─── Placeholder image detection ──────────────────────────────────────────────
// Last.fm's "no image" placeholder is universal — same hash across all artists.
// We treat any lastfm-hosted URL as suspect since their real images are sparse
// and often outdated; Spotify CDN images are far better when available.

const LASTFM_HOSTNAMES = ['lastfm.freetls.fastly.net', 'last.fm/i/u'];
const LASTFM_NULL_HASH = '2a96cbd8b46e442fc41c2b86b821562f';

export function isLastFmPlaceholderUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.includes(LASTFM_NULL_HASH)) return true;
  return LASTFM_HOSTNAMES.some((host) => url.includes(host));
}

// ─── Redis-backed sliding-window rate limiter ─────────────────────────────────
// Last.fm's rate ceiling is 5 req/sec. We leave headroom (4/sec) and use a
// shared Redis ZSET so the limit holds across multiple Cloud Run instances.
// Sliding window: at any moment, ZCARD ≤ RATE_LIMIT for the trailing 1 second.

const RATE_KEY = 'lastfm:ratelimit';
const RATE_LIMIT = 4;
const WINDOW_MS = 1000;
const MAX_WAIT_MS = 5000;

async function acquireRateSlot(): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Drop entries older than the window so ZCARD reflects current pressure
    await redis.zremrangebyscore(RATE_KEY, 0, cutoff);
    const count = await redis.zcard(RATE_KEY);

    if (count < RATE_LIMIT) {
      // Add a unique entry — score is the timestamp, member is timestamp+rand
      // (rand makes collisions impossible across concurrent callers)
      const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
      await redis.zadd(RATE_KEY, now, member);
      // TTL guard: if the limiter sits idle, the key expires (we don't care
      // about cleanup since each call zremrangebyscores anyway, but this
      // prevents the key from lingering forever on Redis restart edge cases).
      await redis.expire(RATE_KEY, 5);
      return;
    }

    if (now - startedAt > MAX_WAIT_MS) {
      logger.warn(
        { count, limit: RATE_LIMIT, waited: now - startedAt },
        'Last.fm rate limiter: max wait exceeded, proceeding anyway'
      );
      return;
    }

    // Window full — wait until the oldest entry ages out
    const oldest = await redis.zrange(RATE_KEY, 0, 0, 'WITHSCORES');
    const oldestScore = oldest[1] ? parseInt(oldest[1], 10) : now;
    const waitMs = Math.max(50, Math.min(WINDOW_MS, oldestScore + WINDOW_MS - now));
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

// ─── Main lookup ──────────────────────────────────────────────────────────────

const BASE = 'https://ws.audioscrobbler.com/2.0/';

/**
 * Looks up an artist by name and returns their top tags (used as genres).
 * Returns null if Last.fm doesn't know the artist. Throws on network errors.
 *
 * `autocorrect=1` makes Last.fm fuzzy-match minor name variations.
 *
 * Internally rate-limited via Redis — safe to call concurrently from multiple
 * processes; the cluster-wide limit is held under 4 req/sec.
 */
export async function getLastFmArtistInfo(name: string): Promise<LastFmArtistInfo | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) throw new Error('LASTFM_API_KEY is not set');

  await acquireRateSlot();

  const url =
    `${BASE}?method=artist.getinfo` +
    `&artist=${encodeURIComponent(name)}` +
    `&api_key=${apiKey}` +
    `&format=json` +
    `&autocorrect=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'SoundSage/1.0' },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Last.fm API ${res.status} on artist.getinfo`);
  }

  const data = (await res.json()) as LastFmArtistInfoResponse;

  // Error code 6 = artist not found — not an error from our perspective
  if (data.error === 6) return null;

  if (data.error || !data.artist) {
    logger.warn(
      { name, error: data.error, message: data.message },
      'Last.fm: artist lookup error'
    );
    return null;
  }

  const tags = (data.artist.tags?.tag ?? [])
    .slice(0, 5)
    .map((t) => t.name.toLowerCase().trim())
    .filter((t) => t.length > 0);

  // Last.fm images are almost always placeholders. We attempt to grab one,
  // but the caller should run isLastFmPlaceholderUrl() and discard if so.
  let imageUrl: string | null = null;
  const images = data.artist.image ?? [];
  for (let i = images.length - 1; i >= 0; i--) {
    const candidate = images[i];
    if (candidate && candidate['#text']) {
      imageUrl = candidate['#text'];
      break;
    }
  }

  return {
    name: data.artist.name,
    tags,
    imageUrl: imageUrl && !isLastFmPlaceholderUrl(imageUrl) ? imageUrl : null,
  };
}
