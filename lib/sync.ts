import { db } from './db';
import { ensureFreshToken } from './spotify-tokens';
import { spotifyGet } from './spotify';
import { redis } from './redis';
import { invalidatePrefix } from './cache';
import { syncStart, syncStage, activity } from './sync-progress';
import logger from './logger';

// ─── Spotify response shapes (richer than the shared type — includes album) ───

interface RichTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
}

interface RichPlayHistoryItem {
  track: RichTrack;
  played_at: string; // ISO 8601
}

interface RecentlyPlayedResponse {
  items: RichPlayHistoryItem[];
  next: string | null;
  cursors?: { after: string; before: string };
}

// ─── Public result type ───────────────────────────────────────────────────────

export interface SyncResult {
  inserted: number;
  cursor: Date | null;
  skipped: boolean; // true when account missing / needs reconnect
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function incrementalSync(
  userId: string,
  allowRetry = true,
): Promise<SyncResult> {
  await syncStart(userId);

  const account = await db.spotifyAccount.findUnique({ where: { userId } });

  if (!account) {
    logger.info({ userId }, 'Sync skipped: no Spotify account');
    await syncStage(userId, 'error', 'no Spotify account linked');
    return { inserted: 0, cursor: null, skipped: true };
  }

  if (account.needsReconnect) {
    logger.info({ userId }, 'Sync skipped: account needs reconnect');
    await syncStage(userId, 'error', 'account needs reconnect');
    return { inserted: 0, cursor: account.cursor, skipped: true };
  }

  // Ensure we have a valid access token (refreshes if needed)
  await syncStage(userId, 'token', 'Checking access token');
  await activity(userId, '↻', 'ensuring fresh access token');
  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
    await activity(userId, '✓', 'access token ready');
  } catch (err) {
    await activity(userId, '⚠', `token refresh failed: ${String(err).slice(0, 80)}`);
    await syncStage(userId, 'error', 'token refresh failed');
    await bumpFailureCount(userId, account.failureCount);
    throw err;
  }

  // Build query — use cursor (epoch ms) if we have one
  const qs = new URLSearchParams({ limit: '50' });
  if (account.cursor) {
    qs.set('after', String(account.cursor.getTime()));
  }

  await syncStage(userId, 'fetch', 'Fetching recent plays from Spotify');
  await activity(userId, '→', `GET /v1/me/player/recently-played?${qs.toString()}`);
  let data: RecentlyPlayedResponse;
  try {
    data = await spotifyGet<RecentlyPlayedResponse>(
      `/me/player/recently-played?${qs.toString()}`,
      accessToken
    );
  } catch (err) {
    await activity(userId, '⚠', `Spotify fetch failed: ${String(err).slice(0, 80)}`);
    await syncStage(userId, 'error', 'Spotify API error');
    await bumpFailureCount(userId, account.failureCount);
    throw err;
  }

  const items = data.items ?? [];
  await activity(userId, '✓', `Spotify returned ${items.length} item${items.length === 1 ? '' : 's'}`);

  // Nothing new — just stamp lastSyncAt and return.
  //
  // BUT: Spotify's /recently-played endpoint has an indexing delay of
  // 30s-2min. If we just synced and got 0 items but the user is actively
  // listening (or just was), the play probably hasn't propagated to the
  // API yet. Schedule one delayed retry to catch the lagging play before
  // the next 15-min cron tick. Without this, manual "Run sync now" right
  // after playing a track frequently appears to do nothing.
  if (items.length === 0) {
    await db.spotifyAccount.update({
      where: { userId },
      data: { lastSyncAt: new Date(), failureCount: 0 },
    });

    // Detect "user is actively playing now" via /me/player/currently-playing.
    // 204 / null = idle. Anything with a track = active. Failures here are
    // non-fatal — if we can't tell, skip the retry rather than retry blindly.
    let isActive = false;
    try {
      const playing = await spotifyGet<{ is_playing?: boolean; item?: unknown } | null>(
        '/me/player/currently-playing',
        accessToken
      );
      isActive = !!(playing && playing.is_playing && playing.item);
    } catch {
      isActive = false;
    }

    if (isActive && allowRetry) {
      await activity(userId, '⚠', 'Spotify hasn\'t indexed your latest plays yet');
      await activity(userId, '↻', 'scheduling retry in 75s (indexing delay)');
      // Fire-and-forget delayed retry. The retry passes allowRetry=false
      // so it can't recurse — one retry is enough; if it still fails the
      // next 15-min cron tick handles it.
      setTimeout(() => {
        incrementalSync(userId, false).catch((err) =>
          logger.warn({ userId, err: String(err) }, 'Delayed retry sync failed')
        );
      }, 75_000);
      await syncStage(userId, 'done', 'Up to date — retry queued for indexing delay');
    } else {
      await activity(userId, '✓', 'no new plays since last sync');
      await syncStage(userId, 'done', 'Up to date — no new plays');
    }
    return { inserted: 0, cursor: account.cursor, skipped: false };
  }

  // msPlayed is a best-effort estimate: Spotify's recently-played API does
  // not return how much of the track was played, only that it was played
  // (and Spotify only includes plays >=30s here). We assume full duration —
  // accurate for the majority of plays, low-impact when wrong since most
  // queries already aggregate by play count not millisecond precision.
  // Extended-history imports (Phase 5) overwrite this with actual ms_played.
  const rawEvents = items.map((item) => ({
    userId,
    trackId: item.track.id,
    playedAt: new Date(item.played_at),
    msPlayed: item.track.duration_ms,
    source: 'recently_played' as const,
  }));

  // Fuzzy dedupe vs. real-time promotions written by /api/listening/promote.
  // Promote stamps `playedAt` at the moment the client saw the track end;
  // Spotify's `played_at` is set when their indexer eventually picks the
  // play up — typically within 90s of the real end. The composite unique
  // index is exact-match, so without this filter we'd insert both copies
  // of the same play. Window matches the promote endpoint.
  const PROMOTE_DEDUPE_WINDOW_MS = 90_000;
  const candidateRange = rawEvents.reduce<{ min: Date; max: Date } | null>(
    (acc, e) => {
      if (!acc) return { min: e.playedAt, max: e.playedAt };
      return {
        min: e.playedAt < acc.min ? e.playedAt : acc.min,
        max: e.playedAt > acc.max ? e.playedAt : acc.max,
      };
    },
    null
  );
  const recentPromotions = candidateRange
    ? await db.listeningEvent.findMany({
        where: {
          userId,
          source: 'currently_playing',
          playedAt: {
            gte: new Date(candidateRange.min.getTime() - PROMOTE_DEDUPE_WINDOW_MS),
            lte: new Date(candidateRange.max.getTime() + PROMOTE_DEDUPE_WINDOW_MS),
          },
        },
        select: { trackId: true, playedAt: true },
      })
    : [];
  const events = rawEvents.filter((e) => {
    const collision = recentPromotions.find(
      (p) =>
        p.trackId === e.trackId &&
        Math.abs(p.playedAt.getTime() - e.playedAt.getTime()) <= PROMOTE_DEDUPE_WINDOW_MS
    );
    return !collision;
  });
  const fuzzySkipped = rawEvents.length - events.length;
  if (fuzzySkipped > 0) {
    await activity(userId, '↻', `skipped ${fuzzySkipped} already-promoted play${fuzzySkipped === 1 ? '' : 's'}`);
  }

  // If everything was already promoted, just advance lastSyncAt and bail —
  // there's nothing for the transaction to insert.
  if (events.length === 0) {
    await db.spotifyAccount.update({
      where: { userId },
      data: { lastSyncAt: new Date(), failureCount: 0 },
    });
    await syncStage(userId, 'done', 'Up to date — all plays already captured live');
    return { inserted: 0, cursor: account.cursor, skipped: false };
  }

  // New high-water mark = latest playedAt in this batch
  const newCursor = events.reduce(
    (max, e) => (e.playedAt > max ? e.playedAt : max),
    events[0].playedAt
  );

  // Atomically insert events + advance cursor
  await syncStage(userId, 'persist', `Inserting ${events.length} events`);
  await activity(userId, '→', `INSERT ${events.length} listening events (transaction)`);
  let inserted = 0;
  try {
    const result = await db.$transaction(async (tx) => {
      const createResult = await tx.listeningEvent.createMany({
        data: events,
        skipDuplicates: true,
      });
      await tx.spotifyAccount.update({
        where: { userId },
        data: { cursor: newCursor, lastSyncAt: new Date(), failureCount: 0 },
      });
      return createResult;
    });
    inserted = result.count;
    await activity(userId, '✓', `inserted ${inserted} new event${inserted === 1 ? '' : 's'} (${events.length - inserted} duplicate${events.length - inserted === 1 ? '' : 's'} skipped)`);
  } catch (err) {
    await activity(userId, '⚠', `DB insert failed: ${String(err).slice(0, 80)}`);
    await syncStage(userId, 'error', 'database insert failed');
    await bumpFailureCount(userId, account.failureCount);
    throw err;
  }

  // Track + artist metadata MUST land before we report success — the
  // RecentStream query joins ListeningEvent.trackId → Track to get the
  // display name, and a missing Track row makes the just-played track
  // render as "Unknown" until the next upsert. This was a few hundred
  // ms of "stale" feeling on every sync. Upsert is bounded to ~50 rows
  // so awaiting it costs us very little.
  await syncStage(userId, 'metadata', 'Updating track + artist metadata');
  await activity(userId, '→', `upserting metadata for ${items.length} tracks`);
  try {
    await upsertMetadata(items);
    await activity(userId, '✓', 'track + artist metadata updated');
  } catch (err) {
    await activity(userId, '⚠', `metadata upsert failed (non-fatal): ${String(err).slice(0, 60)}`);
    logger.warn({ userId, err: String(err) }, 'Metadata upsert failed (non-fatal)');
  }
  // Genre backfill is the long-tail piece — keep it fire-and-forget.
  import('./artist-backfill')
    .then(({ backfillArtistGenresForUser }) => backfillArtistGenresForUser(userId))
    .catch((err) =>
      logger.warn({ userId, err: String(err) }, 'Genre backfill failed (non-critical)')
    );

  // Append to Redis sync log (last 5 entries per user)
  appendSyncLog(userId, inserted, newCursor).catch(() => undefined);

  // Refine msPlayed for this user's recently-played events using the
  // gap-to-next-play heuristic. The previously-most-recent event now has a
  // "next" event so its ms_played can be inferred properly. Fire-and-forget.
  import('./infer-msplayed')
    .then(({ inferMsPlayedForUser }) => inferMsPlayedForUser(userId))
    .catch((err) =>
      logger.warn({ userId, err: String(err) }, 'msPlayed inference failed (non-critical)')
    );

  // Invalidate cached stats for this user — they now have new events to count.
  // Fire-and-forget; cache misses are cheap and a slow Redis shouldn't block.
  invalidatePrefix(`stats:${userId}:`).catch(() => undefined);

  await syncStage(userId, 'finalize', 'Refreshing caches');
  await activity(userId, '→', 'invalidating stats cache + scheduling background jobs');

  await syncStage(userId, 'done', `Synced ${inserted} new play${inserted === 1 ? '' : 's'}`);
  await activity(userId, '✓', `sync complete — ${inserted} new event${inserted === 1 ? '' : 's'}`);

  logger.info({ userId, inserted, cursor: newCursor.toISOString() }, 'Sync complete');
  return { inserted, cursor: newCursor, skipped: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function bumpFailureCount(userId: string, currentCount: number) {
  const failureCount = currentCount + 1;
  const needsReconnect = failureCount >= 10;
  await db.spotifyAccount
    .update({ where: { userId }, data: { failureCount, needsReconnect } })
    .catch(() => undefined); // don't mask the original error
  logger.warn({ userId, failureCount, needsReconnect }, 'Sync failure recorded');
}

async function upsertMetadata(items: RichPlayHistoryItem[]) {
  const seenTracks = new Set<string>();
  const tracks: {
    id: string;
    name: string;
    artistNames: string[];
    artistIds: string[];
    albumName: string;
    albumId: string;
    imageUrl: string | null;
    durationMs: number;
  }[] = [];

  const seenArtists = new Set<string>();
  const artists: { id: string; name: string }[] = [];

  for (const { track } of items) {
    if (!seenTracks.has(track.id)) {
      seenTracks.add(track.id);
      tracks.push({
        id: track.id,
        name: track.name,
        artistNames: track.artists.map((a) => a.name),
        artistIds: track.artists.map((a) => a.id),
        albumName: track.album.name,
        albumId: track.album.id,
        imageUrl: track.album.images[0]?.url ?? null,
        durationMs: track.duration_ms,
      });
    }
    for (const a of track.artists) {
      if (seenArtists.has(a.id)) continue;
      seenArtists.add(a.id);
      artists.push({ id: a.id, name: a.name });
    }
  }

  // Per-row upsert (not createMany + skipDuplicates) so existing tracks get
  // their artistIds/album fields filled in when they were first inserted under
  // an older sync that didn't capture them. Artist genre/imageUrl is left
  // alone — that's the genre backfill job's responsibility.
  await Promise.all(
    tracks.map((t) =>
      db.track.upsert({
        where: { id: t.id },
        create: t,
        update: {
          name: t.name,
          artistNames: t.artistNames,
          artistIds: t.artistIds,
          albumName: t.albumName,
          albumId: t.albumId,
          imageUrl: t.imageUrl,
          durationMs: t.durationMs,
        },
      })
    )
  );

  await Promise.all(
    artists.map((a) =>
      db.artist.upsert({
        where: { id: a.id },
        create: a,
        update: { name: a.name },
      })
    )
  );
}

async function appendSyncLog(userId: string, count: number, cursor: Date) {
  const key = `sync:log:${userId}`;
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    count,
    cursor: cursor.toISOString(),
  });
  await redis.lpush(key, entry);
  await redis.ltrim(key, 0, 4); // keep last 5
}
