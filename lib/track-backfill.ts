import { db } from './db';
import { getTrackById } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

// Fills missing metadata on legacy Track rows — specifically rows synced
// before albumId/artistIds were captured, or rows whose cursor advanced
// past them so /me/player/recently-played never re-included them.
//
// Idempotent. Each row needs at most one /v1/tracks/{id} round-trip.
// Parallel-batched to keep wall-clock time low.

const MAX_TRACKS_PER_RUN = 250;
const CHUNK_SIZE = 10;

export async function backfillTrackMetadataForUser(userId: string): Promise<{
  fetched: number;
  remaining: number;
}> {
  logger.info({ userId }, 'Track backfill: starting');

  // Find tracks the user has played that are missing structured artist or
  // album data. Only target this user's played tracks — pre-warming tracks
  // they haven't listened to is wasted effort.
  const targets = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT DISTINCT t.id
     FROM tracks t
     JOIN listening_events e ON e."trackId" = t.id
     WHERE e."userId" = $1
       AND (cardinality(t."artistIds") = 0
            OR t."albumId" IS NULL
            OR t."imageUrl" IS NULL)
       -- Skip synthetic data from scripts/seed-events.ts which has fake IDs
       AND t.id NOT LIKE 'seed_%'
     LIMIT $2`,
    userId,
    MAX_TRACKS_PER_RUN + 1
  );

  if (targets.length === 0) {
    logger.info({ userId }, 'Track backfill: no tracks need refilling');
    return { fetched: 0, remaining: 0 };
  }

  const work = targets.slice(0, MAX_TRACKS_PER_RUN);
  const remaining = Math.max(0, targets.length - MAX_TRACKS_PER_RUN);

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (err) {
    logger.warn(
      { userId, err: String(err) },
      'Track backfill: cannot refresh user token'
    );
    return { fetched: 0, remaining: targets.length };
  }

  let fetched = 0;
  for (let i = 0; i < work.length; i += CHUNK_SIZE) {
    const chunk = work.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((t) => fillOne(t.id, accessToken))
    );
    fetched += results.filter(Boolean).length;
  }

  logger.info({ userId, fetched, remaining }, 'Track backfill: complete');
  return { fetched, remaining };
}

async function fillOne(trackId: string, accessToken: string): Promise<boolean> {
  let data;
  try {
    data = await getTrackById(trackId, accessToken);
  } catch (err) {
    logger.warn(
      { trackId, err: String(err) },
      'Track backfill: getTrackById failed (continuing)'
    );
    return false;
  }

  if (!data) return false;

  try {
    await db.track.update({
      where: { id: trackId },
      data: {
        name: data.name,
        artistNames: data.artists.map((a) => a.name),
        artistIds: data.artists.map((a) => a.id),
        albumName: data.album.name,
        albumId: data.album.id,
        imageUrl: data.album.images[0]?.url ?? null,
        durationMs: data.duration_ms,
      },
    });

    // Also seed Artist rows so the genre backfill can pick them up next run
    await Promise.all(
      data.artists.map((a) =>
        db.artist.upsert({
          where: { id: a.id },
          create: { id: a.id, name: a.name },
          update: { name: a.name },
        })
      )
    );

    return true;
  } catch (err) {
    logger.warn(
      { trackId, err: String(err) },
      'Track backfill: DB update failed (continuing)'
    );
    return false;
  }
}
