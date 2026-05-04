// SoundSage — Spotify Top Items bootstrap
//
// Spotify's recently-played API only returns the last ~24 hours and ~50
// tracks. For a brand-new SoundSage user, that means the dashboard sits empty
// (or shows ~today's plays only) for weeks until raw events accumulate. To
// avoid that "come back in a month" first-run experience, we call the
// /v1/me/top/{tracks,artists} endpoints right after a successful Spotify
// connect. Those endpoints return up to 50 items per range, pre-aggregated
// by Spotify across short_term (~4 weeks), medium_term (~6 months), and
// long_term (~12 months).
//
// Persisted into TopTrackSnapshot / TopArtistSnapshot. Page-data fallbacks
// read from these tables when the user's raw event count is too low to
// compute their own ranks (see lib/page-data.ts → getTopTracks /
// getTopArtists). Snapshot is replaced wholesale on each refresh, so
// rankings always reflect current Spotify-side state.

import { db } from './db';
import { spotifyGet, type SpotifyTrackDetails, type SpotifyArtistDetails } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

export type TopRange = 'short_term' | 'medium_term' | 'long_term';
const RANGES: TopRange[] = ['short_term', 'medium_term', 'long_term'];
const TOP_LIMIT = 50;

interface TopTracksResponse {
  items: SpotifyTrackDetails[];
}
interface TopArtistsResponse {
  items: SpotifyArtistDetails[];
}

export interface BootstrapResult {
  tracksByRange: Record<TopRange, number>;
  artistsByRange: Record<TopRange, number>;
}

/**
 * Fetch all 6 top-items sets for `userId`, upsert track + artist metadata,
 * and replace the user's snapshot rows. Idempotent — safe to call repeatedly
 * (e.g., a weekly refresh job). Errors on individual ranges are caught and
 * logged so a flaky single endpoint doesn't kill the whole bootstrap.
 *
 * Designed to be fire-and-forget from the OAuth callback path:
 *
 *     bootstrapTopItems(userId).catch((err) => logger.warn(...))
 *
 * The callback redirects the user back to the dashboard immediately while
 * this finishes in the background. The dashboard's first render usually
 * lands AFTER the snapshot is written (the bootstrap takes ~2-4s; the
 * post-OAuth redirect + page render + RSC payload takes longer).
 */
export async function bootstrapTopItems(userId: string): Promise<BootstrapResult> {
  const accessToken = await ensureFreshToken(userId);

  const tracksByRange: Record<TopRange, number> = {
    short_term: 0, medium_term: 0, long_term: 0,
  };
  const artistsByRange: Record<TopRange, number> = {
    short_term: 0, medium_term: 0, long_term: 0,
  };

  for (const range of RANGES) {
    try {
      const data = await spotifyGet<TopTracksResponse>(
        `/me/top/tracks?time_range=${range}&limit=${TOP_LIMIT}`,
        accessToken
      );
      tracksByRange[range] = await persistTopTracks(userId, range, data.items);
    } catch (err) {
      logger.warn({ userId, range, err: String(err) }, 'top-tracks fetch failed');
    }

    try {
      const data = await spotifyGet<TopArtistsResponse>(
        `/me/top/artists?time_range=${range}&limit=${TOP_LIMIT}`,
        accessToken
      );
      artistsByRange[range] = await persistTopArtists(userId, range, data.items);
    } catch (err) {
      logger.warn({ userId, range, err: String(err) }, 'top-artists fetch failed');
    }
  }

  logger.info({ userId, tracksByRange, artistsByRange }, 'Top-items bootstrap complete');
  return { tracksByRange, artistsByRange };
}

async function persistTopTracks(
  userId: string,
  range: TopRange,
  items: SpotifyTrackDetails[]
): Promise<number> {
  if (items.length === 0) return 0;

  // Upserts run outside the transaction (50 sequential ops inside a single
  // transaction blow past Prisma's default 5s timeout on slow Cloud SQL
  // links — that's why artist snapshots were failing while track ones
  // sometimes succeeded depending on latency). Each upsert is idempotent
  // so atomicity isn't needed across them. The snapshot delete+insert is
  // still wrapped in a single $transaction array so it's all-or-nothing.
  for (const t of items) {
    try {
      await db.track.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          name: t.name,
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album.name,
          albumId: t.album.id,
          imageUrl: t.album.images[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
        update: {
          name: t.name,
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album.name,
          albumId: t.album.id,
          imageUrl: t.album.images[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
      });
    } catch (err) {
      logger.warn(
        { userId, trackId: t.id, err: String(err) },
        'top-tracks upsert failed for one track (continuing)'
      );
    }
  }

  await db.$transaction([
    db.topTrackSnapshot.deleteMany({ where: { userId, range } }),
    db.topTrackSnapshot.createMany({
      data: items.map((t, i) => ({
        userId,
        range,
        rank: i + 1,
        trackId: t.id,
      })),
    }),
  ]);

  return items.length;
}

async function persistTopArtists(
  userId: string,
  range: TopRange,
  items: SpotifyArtistDetails[]
): Promise<number> {
  if (items.length === 0) return 0;

  // Upsert artists OUTSIDE the transaction. Doing 50 sequential upserts
  // inside a transaction can blow past Prisma's default 5-second window
  // on a slow link to Cloud SQL. Each upsert is independently safe and
  // idempotent, so they don't need transactional grouping. The snapshot
  // replacement DOES need to be atomic, so that stays in a transaction.
  for (const a of items) {
    // Spotify occasionally omits `genres` and `images` from /me/top/artists
    // responses (seen with collaboration-credited or remix-only accounts).
    // Coerce to safe defaults so a partial payload doesn't 500 the upsert.
    const genres = Array.isArray(a.genres) ? a.genres : [];
    const images = Array.isArray(a.images) ? a.images : [];
    try {
      await db.artist.upsert({
        where: { id: a.id },
        create: {
          id: a.id,
          name: a.name,
          imageUrl: images[0]?.url ?? null,
          genres,
          genresSynced: genres.length > 0,
        },
        update: {
          name: a.name,
          imageUrl: images[0]?.url ?? null,
          ...(genres.length > 0 ? { genres, genresSynced: true } : {}),
        },
      });
    } catch (err) {
      // Don't let one bad artist stop the rest; log and continue.
      logger.warn(
        { userId, artistId: a.id, err: String(err) },
        'top-artists upsert failed for one artist (continuing)'
      );
    }
  }

  await db.$transaction([
    db.topArtistSnapshot.deleteMany({ where: { userId, range } }),
    db.topArtistSnapshot.createMany({
      data: items.map((a, i) => ({
        userId,
        range,
        rank: i + 1,
        artistId: a.id,
      })),
    }),
  ]);

  return items.length;
}

/**
 * Map the dashboard's TimeRange picker values onto Spotify's top-items
 * `time_range` parameter. Used by page-data fallback queries to pick which
 * snapshot to read when raw events are sparse.
 */
export function snapshotRangeFor(uiRange: string): TopRange {
  switch (uiRange) {
    case '24h':
    case '7d':
    case '4w':
      return 'short_term';
    case '6m':
      return 'medium_term';
    case '1y':
    case 'all':
      return 'long_term';
    default:
      return 'medium_term';
  }
}
