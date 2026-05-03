import { db } from './db';
import { spotifyGet, searchArtistImage, getArtistById } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import { getLastFmArtistInfo, isLastFmPlaceholderUrl } from './lastfm';
import { redis } from './redis';
import logger from './logger';

// ─── Strategy ─────────────────────────────────────────────────────────────────
// Two-source data harvest with cleanup:
//
//   Step 0  cleanup: null out Last.fm placeholder imageUrls; one-time reset
//           of genresSynced for stale empty-genres rows from prior bug runs.
//   Step 1  Spotify /me/top/artists harvest. Mark genresSynced=true ONLY if
//           Spotify returned non-empty genres. Empty-genres artists fall
//           through to Last.fm so they're not stuck without genres.
//   Step 2  Last.fm fallback for any genresSynced=false artist. Marks synced
//           after, regardless of whether Last.fm had data — this prevents
//           re-hammering Last.fm for the genuinely-unknown long tail.
//
// /v1/artists is intentionally not used: it requires Spotify Extended Quota
// and 403s under default dev mode. /me/top/artists is user-scoped and works
// under default quota.

interface SpotifyTopArtist {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
}

interface TopArtistsResponse {
  items: SpotifyTopArtist[];
}

const TOP_RANGES = ['short_term', 'medium_term', 'long_term'] as const;
const MAX_LASTFM_PER_RUN = 200;

interface BackfillResult {
  fetched: number;
  remaining: number;
  source: 'spotify' | 'lastfm' | 'mixed' | 'none';
}

export async function backfillArtistGenresForUser(
  userId: string
): Promise<BackfillResult> {
  logger.info({ userId }, 'Genre backfill: starting');

  // ── Identify the user's played artist universe ────────────────────────────
  const trackRows = await db.listeningEvent.findMany({
    where: { userId },
    select: { trackId: true },
    distinct: ['trackId'],
  });
  const trackIds = trackRows.map((r) => r.trackId);

  if (trackIds.length === 0) {
    logger.info({ userId }, 'Genre backfill: user has no listening events');
    return { fetched: 0, remaining: 0, source: 'none' };
  }

  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    select: { artistIds: true },
  });
  const playedArtistIds = [
    ...new Set(tracks.flatMap((t) => t.artistIds).filter((id) => id && id.length > 0)),
  ];

  // ── Step 0: cleanup ────────────────────────────────────────────────────────
  const cleanup = await runCleanup(userId, playedArtistIds);

  // ── Step 1: Spotify top-artists harvest ────────────────────────────────────
  const harvest = await harvestFromTopArtists(userId);

  // ── Step 2: Spotify ID lookup (fast, parallel) ─────────────────────────────
  // Runs BEFORE Last.fm so that artists with Spotify genres available skip
  // the slow rate-limited Last.fm path entirely. Also fills any missing
  // images via /v1/artists/{id} (or search by name as a fallback).
  const imagesFetched = await fillMissingImagesViaSearch(userId);

  // ── Step 3: Last.fm fallback for whatever's still genresSynced=false ─────
  // After Step 2, only artists that Spotify returned no genres for (or where
  // /v1/artists/{id} failed) remain unsynced. Last.fm covers this residue.
  const unsynced = await db.artist.findMany({
    where: { genresSynced: false },
    select: { id: true, name: true },
    take: MAX_LASTFM_PER_RUN + 1,
  });

  logger.info(
    {
      userId,
      tracksPlayed: trackIds.length,
      playedArtists: playedArtistIds.length,
      cleanedImages: cleanup.imagesCleaned,
      cleanupResetSynced: cleanup.resetSynced,
      spotifyTopHarvested: harvest.updated,
      spotifyImagesFetched: imagesFetched,
      lastfmCandidates: unsynced.length,
    },
    'Genre backfill: pre-Last.fm state'
  );

  const lastfmTargets = unsynced.slice(0, MAX_LASTFM_PER_RUN);
  const remaining = Math.max(0, unsynced.length - MAX_LASTFM_PER_RUN);

  let lastfmFetched = 0;
  if (lastfmTargets.length > 0) {
    if (process.env.LASTFM_API_KEY) {
      lastfmFetched = await fillFromLastFm(userId, lastfmTargets);
    } else {
      logger.warn(
        { userId, unfilled: lastfmTargets.length },
        'Genre backfill: LASTFM_API_KEY not set; cannot fall back'
      );
    }
  }

  const fetched = harvest.updated + lastfmFetched;
  const source: BackfillResult['source'] =
    harvest.updated > 0 && lastfmFetched > 0
      ? 'mixed'
      : harvest.updated > 0
      ? 'spotify'
      : lastfmFetched > 0
      ? 'lastfm'
      : 'none';

  logger.info(
    {
      userId,
      fetched,
      spotifyFetched: harvest.updated,
      lastfmFetched,
      imagesFetched,
      remaining,
      source,
    },
    'Artist genre backfill run complete'
  );
  return { fetched, remaining, source };
}

// ─── Step 3: Spotify image fallback (ID lookup → search by name) ─────────────

const GET_ARTIST_BLOCKED_FLAG = 'spotify:get_artist_blocked';
const SEARCH_BLOCKED_FLAG = 'spotify:search_blocked';
const FLAG_TTL_SECONDS = 24 * 60 * 60;
const MAX_IMAGE_LOOKUPS_PER_RUN = 250;

async function fillMissingImagesViaSearch(userId: string): Promise<number> {
  // Target artists missing EITHER an image OR genres. /v1/artists/{id}
  // returns both, so this single endpoint can fill either gap. We dedup
  // here so Last.fm can skip artists Spotify already covered for genres.
  const targets = await db.$queryRawUnsafe<{ id: string; name: string }[]>(
    `SELECT id, name FROM artists
     WHERE "imageUrl" IS NULL OR "genresSynced" = false
     ORDER BY "updatedAt" DESC
     LIMIT $1`,
    MAX_IMAGE_LOOKUPS_PER_RUN
  );

  if (targets.length === 0) return 0;

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (err) {
    logger.warn(
      { userId, err: String(err) },
      'Genre backfill: cannot refresh user token for image fallback'
    );
    return 0;
  }

  // Check which paths are currently blocked (per Redis flags). These flip
  // mid-run when a 403 is observed; a shared object lets parallel workers
  // see each other's discovery.
  const state = {
    getArtistBlocked: !!(await redis.get(GET_ARTIST_BLOCKED_FLAG).catch(() => null)),
    searchBlocked: !!(await redis.get(SEARCH_BLOCKED_FLAG).catch(() => null)),
  };

  const CHUNK_SIZE = 10;
  let fetched = 0;

  // Process in chunks of N concurrent requests. Spotify's per-token rate
  // ceiling is well above 10/sec, so this is safe.
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    if (state.getArtistBlocked && state.searchBlocked) break;

    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((a) => processOne(a, accessToken, userId, state))
    );

    for (const r of results) if (r.fetched) fetched++;
  }

  if (fetched > 0) {
    logger.info(
      { userId, fetched, attempted: targets.length },
      'Genre backfill: image fallback fill'
    );
  }
  return fetched;
}

async function processOne(
  artist: { id: string; name: string },
  accessToken: string,
  userId: string,
  state: { getArtistBlocked: boolean; searchBlocked: boolean }
): Promise<{ fetched: boolean }> {
  let imageUrl: string | null = null;
  let foundGenres: string[] | null = null;

  // Path 1: direct ID lookup. Most reliable when available; also returns
  // up-to-date genres which we use if the row is currently genre-less.
  if (!state.getArtistBlocked) {
    try {
      const data = await getArtistById(artist.id, accessToken);
      if (data) {
        imageUrl = data.images?.[0]?.url ?? null;
        if (Array.isArray(data.genres) && data.genres.length > 0) {
          foundGenres = data.genres;
        }
      }
    } catch (err) {
      const message = String(err);
      if (message.includes('403')) {
        await redis
          .set(GET_ARTIST_BLOCKED_FLAG, '1', 'EX', FLAG_TTL_SECONDS)
          .catch(() => undefined);
        state.getArtistBlocked = true;
        logger.warn(
          { userId },
          'Genre backfill: /v1/artists/{id} returned 403 — falling back to search'
        );
      } else {
        logger.warn(
          { artistId: artist.id, name: artist.name, err: message },
          'Genre backfill: get-artist-by-id failed (will try search)'
        );
      }
    }
  }

  // Path 2: name-based search fallback. Exact-name match guards against
  // picking the wrong namesake.
  if (!imageUrl && !state.searchBlocked) {
    try {
      imageUrl = await searchArtistImage(artist.name, accessToken);
    } catch (err) {
      const message = String(err);
      if (message.includes('403')) {
        await redis
          .set(SEARCH_BLOCKED_FLAG, '1', 'EX', FLAG_TTL_SECONDS)
          .catch(() => undefined);
        state.searchBlocked = true;
        logger.warn(
          { userId },
          'Genre backfill: /v1/search returned 403 — image fallback disabled for 24h'
        );
      } else {
        logger.warn(
          { artistId: artist.id, name: artist.name, err: message },
          'Genre backfill: image search failed (continuing)'
        );
      }
    }
  }

  if (imageUrl || foundGenres) {
    await db.artist
      .update({
        where: { id: artist.id },
        data: {
          ...(imageUrl ? { imageUrl } : {}),
          // When Spotify gave us genres, also mark genresSynced=true so the
          // downstream Last.fm step skips this artist — major speedup.
          ...(foundGenres ? { genres: foundGenres, genresSynced: true } : {}),
        },
      })
      .catch(() => undefined);
  }

  return { fetched: !!imageUrl };
}

// ─── Step 0: cleanup ──────────────────────────────────────────────────────────

const ONE_TIME_CLEANUP_FLAG = 'artist-cleanup-v2-done';

async function runCleanup(
  userId: string,
  playedArtistIds: string[]
): Promise<{ imagesCleaned: number; resetSynced: number }> {
  // Always: NULL out Last.fm placeholder imageUrls. Idempotent — once cleaned,
  // they stay cleaned. New ones arriving from Last.fm shouldn't happen anymore
  // because lib/lastfm.ts now returns null for placeholders.
  const imagesCleaned = await db.artist.updateMany({
    where: {
      id: { in: playedArtistIds },
      OR: [
        { imageUrl: { contains: 'lastfm.freetls.fastly.net' } },
        { imageUrl: { contains: '2a96cbd8b46e442fc41c2b86b821562f' } },
      ],
    },
    data: { imageUrl: null },
  });

  // One-time per user: existing rows with `genresSynced=true && genres=[]` came
  // from the prior code path that didn't run Last.fm fallback after Spotify
  // returned empty genres. Reset them so this run picks them up. Gate with a
  // Redis flag so we don't reset the same user twice.
  const flagKey = `${ONE_TIME_CLEANUP_FLAG}:${userId}`;
  const alreadyDone = await redis.get(flagKey).catch(() => null);

  let resetSynced = 0;
  if (!alreadyDone && playedArtistIds.length > 0) {
    // Use raw SQL with cardinality() to definitively catch empty arrays —
    // Prisma's `genres: { isEmpty: true }` proved unreliable in this case.
    const updated = await db.$executeRawUnsafe<number>(
      `UPDATE artists
       SET "genresSynced" = false
       WHERE id = ANY($1::text[])
         AND "genresSynced" = true
         AND (cardinality(genres) = 0 OR genres IS NULL)`,
      playedArtistIds
    );
    resetSynced = Number(updated);
    await redis.set(flagKey, '1').catch(() => undefined);
    logger.info(
      { userId, resetSynced },
      'Genre backfill: one-time cleanup of stale empty-genres rows'
    );
  }

  return { imagesCleaned: imagesCleaned.count, resetSynced };
}

// ─── Step 1: Spotify /me/top/artists harvest ──────────────────────────────────

async function harvestFromTopArtists(userId: string): Promise<{ updated: number }> {
  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (err) {
    logger.warn(
      { userId, err: String(err) },
      'Genre backfill: cannot refresh user token for top-artists harvest'
    );
    return { updated: 0 };
  }

  const seen = new Map<
    string,
    { name: string; genres: string[]; imageUrl: string | null }
  >();

  for (const range of TOP_RANGES) {
    try {
      const data = await spotifyGet<TopArtistsResponse>(
        `/me/top/artists?limit=50&time_range=${range}`,
        accessToken
      );
      for (const a of data.items) {
        if (seen.has(a.id)) continue;
        // Defensive: Spotify occasionally omits `genres` or `images` for
        // certain artists, especially under default-quota responses.
        seen.set(a.id, {
          name: a.name ?? '',
          genres: Array.isArray(a.genres) ? a.genres : [],
          imageUrl: a.images?.[0]?.url ?? null,
        });
      }
    } catch (err) {
      logger.warn(
        { userId, range, err: String(err) },
        'Genre backfill: top-artists fetch failed for range (continuing)'
      );
    }
  }

  if (seen.size === 0) return { updated: 0 };

  // Parallel upsert — Prisma's connection pool will batch these. With ~80
  // artists × ~10ms per upsert, this drops from ~800ms sequential to ~100ms.
  //
  // Update-path subtlety: only overwrite genres/genresSynced when Spotify
  // actually returned non-empty genres. Otherwise we'd reset genresSynced
  // to false on every run for Spotify-genre-less artists, forcing Last.fm
  // to re-process the same set repeatedly (huge speed hit on repeat runs).
  const results = await Promise.allSettled(
    Array.from(seen.entries()).map(([id, d]) =>
      db.artist.upsert({
        where: { id },
        create: {
          id,
          name: d.name,
          genres: d.genres,
          imageUrl: d.imageUrl,
          // For new rows: false if Spotify has no genres, so Last.fm runs.
          genresSynced: d.genres.length > 0,
        },
        update: {
          name: d.name,
          imageUrl: d.imageUrl,
          // Only update genres/genresSynced when Spotify gave us something.
          // Otherwise preserve whatever Last.fm or a prior run filled in.
          ...(d.genres.length > 0
            ? { genres: d.genres, genresSynced: true }
            : {}),
        },
      })
    )
  );

  let updated = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      updated++;
    } else {
      logger.warn(
        { err: String(result.reason) },
        'Genre backfill: top-artists upsert failed (continuing)'
      );
    }
  }
  return { updated };
}

// ─── Step 2: Last.fm fallback ────────────────────────────────────────────────

async function fillFromLastFm(
  userId: string,
  targets: { id: string; name: string }[]
): Promise<number> {
  let fetched = 0;
  for (const a of targets) {
    try {
      const info = await getLastFmArtistInfo(a.name);

      // Build update: set genres if we got them. Don't touch imageUrl —
      // we never want to overwrite a real Spotify image with anything from
      // Last.fm, and Last.fm placeholders are filtered to null at the source.
      const data: { genres: string[]; genresSynced: boolean; imageUrl?: string | null } = {
        genres: info?.tags ?? [],
        genresSynced: true, // mark synced regardless of whether Last.fm knew
      };
      // Only set imageUrl if Last.fm returned a real (non-placeholder) one
      // AND the artist doesn't already have a Spotify image.
      if (info?.imageUrl && !isLastFmPlaceholderUrl(info.imageUrl)) {
        const existing = await db.artist.findUnique({
          where: { id: a.id },
          select: { imageUrl: true },
        });
        if (!existing?.imageUrl) {
          data.imageUrl = info.imageUrl;
        }
      }

      await db.artist.update({ where: { id: a.id }, data });
      if (info && info.tags.length > 0) fetched++;
    } catch (err) {
      logger.warn(
        { artistId: a.id, name: a.name, err: String(err) },
        'Genre backfill: Last.fm lookup failed (continuing)'
      );
    }
  }
  return fetched;
}
