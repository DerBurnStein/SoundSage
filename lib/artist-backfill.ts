import { db } from './db';
import { spotifyGet, getAppAccessToken } from './spotify';
import { redis } from './redis';
import logger from './logger';

// Spotify's `/v1/artists` is Extended-Quota-only as of late 2024. Apps in
// default development mode get 403. When we see that, set a Redis flag so we
// don't burn API calls on every subsequent sync until Extended Quota lands.
const EXTENDED_QUOTA_FLAG = 'spotify:extended_quota_blocked';
const QUOTA_FLAG_TTL_SECONDS = 24 * 60 * 60; // re-check daily

interface SpotifyArtistDetail {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
}

interface ArtistsResponse {
  artists: (SpotifyArtistDetail | null)[];
}

const BATCH_SIZE = 50;
const MAX_ARTISTS_PER_RUN = 200; // 4 round-trips max per sync — keeps the
// genre backfill cheap and avoids burning Spotify quota when a user has
// thousands of unique artists in their backfill.

/**
 * Fetches Spotify artist details (genres, image) for any artists this user
 * has played that haven't yet been backfilled. Updates Artist rows in place.
 *
 * Idempotent. Safe to call after every sync — does nothing if everything is
 * already synced. Errors are logged but not thrown (this is best-effort).
 */
export async function backfillArtistGenresForUser(userId: string): Promise<{
  fetched: number;
  remaining: number;
}> {
  logger.info({ userId }, 'Genre backfill: starting');

  // Skip entirely if we recently confirmed Spotify is blocking /artists
  const blocked = await redis.get(EXTENDED_QUOTA_FLAG).catch(() => null);
  if (blocked) {
    logger.info({ userId }, 'Genre backfill: skipped — Extended Quota flag set');
    return { fetched: 0, remaining: 0 };
  }

  // Step 1: get all distinct trackIds the user has played
  const trackRows = await db.listeningEvent.findMany({
    where: { userId },
    select: { trackId: true },
    distinct: ['trackId'],
  });
  const trackIds = trackRows.map((r) => r.trackId);

  if (trackIds.length === 0) {
    logger.info({ userId }, 'Genre backfill: user has no listening events');
    return { fetched: 0, remaining: 0 };
  }

  // Step 2: pull the artistIds[] from those tracks
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    select: { artistIds: true },
  });
  const playedArtistIds = [
    ...new Set(tracks.flatMap((t) => t.artistIds).filter((id) => id && id.length > 0)),
  ];

  // Step 3: filter to artists that still need genres
  const unsynced = await db.artist.findMany({
    where: {
      id: { in: playedArtistIds },
      genresSynced: false,
    },
    select: { id: true },
    take: MAX_ARTISTS_PER_RUN + 1,
  });

  logger.info(
    {
      userId,
      tracksPlayed: trackIds.length,
      tracksFound: tracks.length,
      playedArtists: playedArtistIds.length,
      unsyncedCount: unsynced.length,
    },
    'Genre backfill: query results'
  );

  if (unsynced.length === 0) return { fetched: 0, remaining: 0 };

  const ids = unsynced.slice(0, MAX_ARTISTS_PER_RUN).map((r) => r.id);
  const remaining = Math.max(0, unsynced.length - MAX_ARTISTS_PER_RUN);

  // Use an app-level token (Client Credentials) — /v1/artists serves shared
  // metadata and user tokens are rejected with 403 under current quota rules.
  let accessToken: string;
  try {
    accessToken = await getAppAccessToken();
  } catch (err) {
    logger.warn({ userId, err: String(err) }, 'Genre backfill: cannot get app token');
    return { fetched: 0, remaining: unsynced.length };
  }

  let fetched = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    try {
      const data = await spotifyGet<ArtistsResponse>(
        `/artists?ids=${batch.join(',')}`,
        accessToken
      );

      for (const a of data.artists) {
        if (!a) continue;
        await db.artist.update({
          where: { id: a.id },
          data: {
            name: a.name,
            genres: a.genres,
            imageUrl: a.images[0]?.url ?? null,
            genresSynced: true,
          },
        });
        fetched++;
      }
    } catch (err) {
      const message = String(err);
      // Detect Spotify Extended-Quota 403 and set the skip flag so the next
      // 24 hours of syncs don't keep retrying.
      if (message.includes('403')) {
        await redis.set(EXTENDED_QUOTA_FLAG, '1', 'EX', QUOTA_FLAG_TTL_SECONDS).catch(() => undefined);
        logger.warn(
          { userId, batchSize: batch.length },
          'Genre backfill: Spotify 403 on /artists — Extended Quota required. ' +
            'Backfill paused for 24h. See https://developer.spotify.com/documentation/web-api/concepts/quota-modes'
        );
      } else {
        logger.warn(
          { userId, batchSize: batch.length, err: message },
          'Genre backfill batch failed'
        );
      }
      // Stop on first error — don't burn quota
      break;
    }
  }

  logger.info({ userId, fetched, remaining }, 'Artist genre backfill run complete');
  return { fetched, remaining };
}
