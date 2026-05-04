// Shared dashboard data layer.
//
// Extracted from each route handler so server components can call these
// directly — bypassing HTTP, cookie forwarding, and the redundant auth()
// check inside each handler. Eliminates ~50-100ms per page render.
//
// Route handlers (under app/api/...) delegate to these same functions, so
// client-side React Query calls and server-side direct calls share one
// SQL/cache implementation.

import { db } from './db';
import { cached } from './cache';
import type { ParsedRange } from './range';
import { trackMood, quadrantOf, type MoodQuadrantId } from './mood';

// historyWindow is a pure, framework-free helper — kept in its own module
// so the unit tests can import it without booting the Prisma client. We
// re-export so existing callers (app/history/page.tsx) keep working.
export { historyWindow, type HistoryView, type HistoryWindow } from './history-window';
import type {
  ActivityStats,
  GenreStat,
  GenreStats,
  HourlyStats,
  OverviewStats,
  RecentEvent,
  RecentHistoryResponse,
  TimeRange,
  TopArtist,
  TopArtistsResponse,
  TopTrack,
  TopTracksResponse,
  WeeklySpark,
} from '@/types';

// ─── Spotify connection (uncached) ────────────────────────────────────────────

export interface SpotifyConnectionStatus {
  connected: boolean;
  spotifyUserId?: string;
  displayName?: string | null;
  imageUrl?: string | null;
  lastSyncAt?: string | null;
  needsReconnect?: boolean;
  failureCount?: number;
  scopes?: string;
}

export async function getSpotifyConnection(userId: string): Promise<SpotifyConnectionStatus> {
  const account = await db.spotifyAccount.findUnique({
    where: { userId },
    select: {
      spotifyUserId: true,
      displayName: true,
      imageUrl: true,
      lastSyncAt: true,
      needsReconnect: true,
      failureCount: true,
      scopes: true,
    },
  });
  if (!account) return { connected: false };
  return {
    connected: true,
    spotifyUserId: account.spotifyUserId,
    displayName: account.displayName,
    imageUrl: account.imageUrl,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    needsReconnect: account.needsReconnect,
    failureCount: account.failureCount,
    scopes: account.scopes,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rangeTtl(range: TimeRange): number {
  if (range === '24h' || range === '7d') return 300;
  if (range === '4w') return 600;
  return 3600;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

interface OverviewRow {
  total_plays: number;
  unique_tracks: number;
  total_ms: number | null;
  top_hour: number | null;
  new_artists: number;
  range_artists: number;
}

export async function getOverview(
  userId: string,
  parsedRange: ParsedRange,
  tz: string
): Promise<OverviewStats> {
  const { range, from, to } = parsedRange;
  return cached<OverviewStats>(
    `stats:${userId}:overview:${range}:${tz}`,
    rangeTtl(range),
    async () => {
      const [row] = await db.$queryRawUnsafe<OverviewRow[]>(
        `WITH events AS (
           SELECT e."trackId" AS track_id, e."playedAt" AS played_at,
                  t."durationMs", t."artistIds"
           FROM listening_events e
           LEFT JOIN tracks t ON t.id = e."trackId"
           WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         ),
         range_artist_ids AS (
           SELECT DISTINCT UNNEST(COALESCE("artistIds", '{}'::text[])) AS aid FROM events
         ),
         prior_artist_ids AS (
           SELECT DISTINCT UNNEST(COALESCE(t."artistIds", '{}'::text[])) AS aid
           FROM listening_events e
           LEFT JOIN tracks t ON t.id = e."trackId"
           WHERE e."userId" = $1 AND e."playedAt" < $2
         ),
         hour_counts AS (
           SELECT EXTRACT(hour FROM (played_at AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS hour,
                  COUNT(*)::int AS c
           FROM events GROUP BY hour
         )
         SELECT
           (SELECT COUNT(*)::int FROM events)                              AS total_plays,
           (SELECT COUNT(DISTINCT track_id)::int FROM events)              AS unique_tracks,
           (SELECT COALESCE(SUM("durationMs"), 0)::bigint FROM events)     AS total_ms,
           (SELECT hour FROM hour_counts ORDER BY c DESC, hour ASC LIMIT 1) AS top_hour,
           (SELECT COUNT(*)::int FROM range_artist_ids r
              WHERE r.aid != '' AND NOT EXISTS (
                SELECT 1 FROM prior_artist_ids p WHERE p.aid = r.aid
              ))                                                           AS new_artists,
           (SELECT COUNT(*)::int FROM range_artist_ids WHERE aid != '')    AS range_artists`,
        userId,
        from,
        to,
        tz
      );
      const totalPlays = row?.total_plays ?? 0;
      const uniqueTracks = row?.unique_tracks ?? 0;
      const totalMs = Number(row?.total_ms ?? 0);
      const topHour = row?.top_hour ?? 0;
      const newArtists = row?.new_artists ?? 0;
      const rangeArtists = row?.range_artists ?? 0;
      const discoveryRate = rangeArtists > 0 ? newArtists / rangeArtists : 0;
      return {
        totalPlays,
        uniqueTracks,
        totalMs,
        topHour,
        newArtists,
        discoveryRate,
        range: { from: from.toISOString(), to: to.toISOString() },
      };
    }
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

interface ActivityRow { bucket: Date; plays: number; total_ms: number | null }

export async function getActivity(
  userId: string,
  parsedRange: ParsedRange,
  grain: 'day' | 'week' | 'month',
  tz: string
): Promise<ActivityStats> {
  const { range, from, to } = parsedRange;
  // v3: reverted to raw totals (per-bucket averaging removed).
  return cached<ActivityStats>(
    `stats:${userId}:activity:v3:${range}:${grain}:${tz}`,
    rangeTtl(range),
    async () => {
      const rows = await db.$queryRawUnsafe<ActivityRow[]>(
        `SELECT date_trunc($5, e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4) AS bucket,
                COUNT(*)::int AS plays,
                COALESCE(SUM(t."durationMs"), 0)::bigint AS total_ms
         FROM listening_events e
         LEFT JOIN tracks t ON t.id = e."trackId"
         WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         GROUP BY bucket
         ORDER BY bucket`,
        userId,
        from,
        to,
        tz,
        grain
      );
      const buckets = rows.map((r) => ({
        t: new Date(r.bucket).toISOString(),
        plays: r.plays,
        mins: Math.round(Number(r.total_ms ?? 0) / 60_000),
      }));
      return { buckets, grain };
    }
  );
}

// ─── Hourly ───────────────────────────────────────────────────────────────────

interface HourlyRow { hour: number; plays: number; total_ms: number | null }

export async function getHourly(
  userId: string,
  parsedRange: ParsedRange,
  tz: string
): Promise<HourlyStats> {
  const { range, from, to } = parsedRange;
  // v3: reverted to raw totals (per-day averaging removed).
  return cached<HourlyStats>(
    `stats:${userId}:hourly:v3:${range}:${tz}`,
    rangeTtl(range),
    async () => {
      const rows = await db.$queryRawUnsafe<HourlyRow[]>(
        `SELECT EXTRACT(hour FROM ("playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS hour,
                COUNT(*)::int AS plays,
                COALESCE(SUM("msPlayed"), 0)::bigint AS total_ms
         FROM listening_events
         WHERE "userId" = $1 AND "playedAt" >= $2 AND "playedAt" < $3
         GROUP BY hour
         ORDER BY hour`,
        userId,
        from,
        to,
        tz
      );
      const byHour = new Map(
        rows.map((r) => [
          r.hour,
          { plays: r.plays, mins: Math.round(Number(r.total_ms ?? 0) / 60_000) },
        ])
      );
      const buckets = Array.from({ length: 24 }, (_, hour) => {
        const v = byHour.get(hour);
        return { hour, plays: v?.plays ?? 0, mins: v?.mins ?? 0 };
      });
      return { buckets };
    }
  );
}

// ─── Weekly sparkline ─────────────────────────────────────────────────────────

interface WeeklyRow { week: Date; total_ms: number | null }

/**
 * Trailing-N-weeks of listening minutes for the WeeklySpark chart.
 * `weekCount` defaults to 12 (the original behaviour) but Overview /
 * Patterns now pass higher counts for longer ranges via `weeksForRange`,
 * so the spark adapts to the time-range picker.
 */
export async function getWeekly(
  userId: string,
  tz: string,
  weekCount = 12
): Promise<WeeklySpark> {
  const safeCount = Math.max(2, Math.min(120, Math.floor(weekCount)));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - safeCount * 7);

  return cached<WeeklySpark>(
    // weekCount in the key so different consumers don't stomp each other.
    `stats:${userId}:weekly:v2:${safeCount}:${tz}`,
    300,
    async () => {
      const rows = await db.$queryRawUnsafe<WeeklyRow[]>(
        `SELECT date_trunc('week', e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $3) AS week,
                COALESCE(SUM(t."durationMs"), 0)::bigint AS total_ms
         FROM listening_events e
         LEFT JOIN tracks t ON t.id = e."trackId"
         WHERE e."userId" = $1 AND e."playedAt" >= $2
         GROUP BY week
         ORDER BY week`,
        userId,
        start,
        tz
      );
      const minsByWeek = new Map<string, number>();
      for (const r of rows) {
        const key = new Date(r.week).toISOString();
        minsByWeek.set(key, Math.round(Number(r.total_ms ?? 0) / 60_000));
      }
      const weeks: number[] = [];
      const cursor = new Date(start);
      const day = cursor.getUTCDay();
      const monShift = (day + 6) % 7;
      cursor.setUTCDate(cursor.getUTCDate() - monShift);
      cursor.setUTCHours(0, 0, 0, 0);
      for (let i = 0; i < safeCount; i++) {
        const key = cursor.toISOString();
        weeks.push(minsByWeek.get(key) ?? 0);
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
      return { weeks };
    }
  );
}

/**
 * Maps a time range to the number of weeks the WeeklySpark should show.
 * Short ranges (24h / 7d / 4w) keep the original 12-week trailing trend
 * because anything narrower would shrink to too few bars. Longer ranges
 * extend the trace so it fully covers the picker's window.
 */
export function weeksForRange(range: TimeRange): number {
  switch (range) {
    case '24h':
    case '7d':
    case '4w':
      return 12;
    case '6m':
      return 26;
    case '1y':
      return 52;
    case 'all':
      return 78;
  }
}

// ─── Genres ───────────────────────────────────────────────────────────────────

interface GenreRow { genre: string; plays: number }

export async function getGenres(
  userId: string,
  parsedRange: ParsedRange,
  limit: number
): Promise<GenreStats> {
  const { range, from, to } = parsedRange;
  return cached<GenreStats>(
    `stats:${userId}:genres:${range}:${limit}`,
    rangeTtl(range),
    async () => {
      const rows = await db.$queryRawUnsafe<GenreRow[]>(
        `SELECT genre, COUNT(*)::int AS plays
         FROM (
           SELECT UNNEST(a.genres) AS genre
           FROM listening_events e
           JOIN tracks t ON t.id = e."trackId"
           JOIN artists a ON a.id = ANY(t."artistIds")
           WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         ) g
         GROUP BY genre
         ORDER BY plays DESC`,
        userId,
        from,
        to
      );
      if (rows.length === 0) return { genres: [] };
      const totalPlays = rows.reduce((s, r) => s + r.plays, 0);
      const top = rows.slice(0, limit);
      const tail = rows.slice(limit);
      const genres = top.map((r) => ({
        name: r.genre,
        plays: r.plays,
        share: totalPlays > 0 ? r.plays / totalPlays : 0,
      }));
      if (tail.length > 0) {
        const otherPlays = tail.reduce((s, r) => s + r.plays, 0);
        genres.push({
          name: 'other',
          plays: otherPlays,
          share: totalPlays > 0 ? otherPlays / totalPlays : 0,
        });
      }
      return { genres };
    }
  );
}

// ─── Top tracks ───────────────────────────────────────────────────────────────

interface TopTrackRow {
  track_id: string;
  plays: number;
  total_ms: number | null;
  last_played_at: Date;
}

export async function getTopTracks(
  userId: string,
  parsedRange: ParsedRange,
  limit: number
): Promise<TopTracksResponse> {
  const { range, from, to } = parsedRange;
  return cached<TopTracksResponse>(
    `stats:${userId}:topTracks:${range}:${limit}`,
    rangeTtl(range),
    async () => {
      const rows = await db.$queryRawUnsafe<TopTrackRow[]>(
        `SELECT e."trackId" AS track_id,
                COUNT(*)::int AS plays,
                COALESCE(SUM(t."durationMs"), 0)::bigint AS total_ms,
                MAX(e."playedAt") AS last_played_at
         FROM listening_events e
         LEFT JOIN tracks t ON t.id = e."trackId"
         WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         GROUP BY e."trackId"
         ORDER BY plays DESC, last_played_at DESC
         LIMIT $4`,
        userId,
        from,
        to,
        limit
      );
      const trackIds = rows.map((r) => r.track_id);
      const tracks = await db.track.findMany({
        where: { id: { in: trackIds } },
        select: {
          id: true, name: true, artistNames: true, artistIds: true,
          albumName: true, albumId: true, imageUrl: true, durationMs: true,
        },
      });
      const trackById = new Map(tracks.map((t) => [t.id, t]));
      const top: TopTrack[] = rows.map((r) => {
        const t = trackById.get(r.track_id);
        const playCount = r.plays;
        const perPlayMs = t?.durationMs ?? 0;
        return {
          id: r.track_id,
          name: t?.name ?? 'Unknown track',
          artists: t
            ? t.artistNames.map((name, i) => ({ id: t.artistIds[i] ?? '', name }))
            : [],
          album: {
            id: t?.albumId ?? '',
            name: t?.albumName ?? '',
            imageUrl: t?.imageUrl ?? null,
          },
          plays: playCount,
          totalMs: Number(r.total_ms ?? perPlayMs * playCount),
          lastPlayedAt: r.last_played_at.toISOString(),
        };
      });

      // Decision: when do we trust events vs. fall back to the rank-only
      // Spotify snapshot?
      //
      // Events are the source of truth IF they exist in volume. With
      // synthetic history (8000+ events) or an ESH/Last.FM import (often
      // 50k+ events), the events query returns a full ranking with real
      // play counts. We use events.
      //
      // For brand-new users with no synth and no import, events are sparse
      // — only the last 24h of /recently-played, which won't fill a 4-week
      // top list. In that case the rank-only snapshot is more honest than
      // showing 5 tracks with 1 play each. We fall back to snapshot.
      //
      // Threshold: top-ranked event row must have at least 5 plays. This
      // separates "real history" (synth/ESH/months of usage) from "fresh
      // user with a handful of recently-played items."
      const longRange = range === '4w' || range === '6m' || range === '1y' || range === 'all';
      const eventsHaveDepth = top.length >= limit && (top[0]?.plays ?? 0) >= 5;

      if (longRange && !eventsHaveDepth) {
        const fromSnap = await topTracksFromSnapshot(userId, range, limit, new Set());
        if (fromSnap.length > 0) {
          // Merge: snapshot first (rank-ordered), then any event tracks
          // that aren't already in the snapshot list.
          const snapIds = new Set(fromSnap.map((t) => t.id));
          const extras = top.filter((t) => !snapIds.has(t.id));
          return { tracks: [...fromSnap, ...extras].slice(0, limit), range };
        }
      }

      // Events path — either short range, or long range with enough volume
      // for events to be authoritative. Tail-fill from snapshot if events
      // came up short of `limit`.
      if (top.length < limit) {
        const fallback = await topTracksFromSnapshot(userId, range, limit - top.length, new Set(top.map((t) => t.id)));
        top.push(...fallback);
      }
      return { tracks: top.slice(0, limit), range };
    }
  );
}

/**
 * Read top-tracks from the snapshot we captured during the Spotify connect
 * bootstrap. Used to populate the dashboard's Tracks tab on first login
 * before raw `recently_played` events have accumulated.
 *
 * `excludeIds` skips tracks already present in the event-derived list so
 * we don't double-count when both sources contain the same track.
 */
async function topTracksFromSnapshot(
  userId: string,
  uiRange: TimeRange,
  limit: number,
  excludeIds: Set<string>
): Promise<TopTrack[]> {
  const { snapshotRangeFor } = await import('./spotify-bootstrap');
  const range = snapshotRangeFor(uiRange);
  const snaps = await db.topTrackSnapshot.findMany({
    where: { userId, range },
    orderBy: { rank: 'asc' },
    take: limit + excludeIds.size,
    include: {
      track: {
        select: {
          id: true, name: true, artistNames: true, artistIds: true,
          albumName: true, albumId: true, imageUrl: true, durationMs: true,
        },
      },
    },
  });
  const out: TopTrack[] = [];
  for (const s of snaps) {
    if (excludeIds.has(s.trackId)) continue;
    const t = s.track;
    out.push({
      id: t.id,
      name: t.name,
      artists: t.artistNames.map((name, i) => ({ id: t.artistIds[i] ?? '', name })),
      album: {
        id: t.albumId ?? '',
        name: t.albumName ?? '',
        imageUrl: t.imageUrl ?? null,
      },
      // We don't have raw play counts here — Spotify's top-tracks API
      // gives us a ranking but never the actual count. We estimate using
      // a Zipfian decay calibrated to look like real listening data:
      //   rank 1  ≈ 95 plays
      //   rank 5  ≈ 35 plays
      //   rank 25 ≈ 9 plays
      //   rank 50 ≈ 4 plays
      // (Zipf with s=0.95, scaled so rank-1 ≈ 95.) Matches the shape of
      // public ESH dumps without overclaiming precision. Linear "51-rank"
      // looked too flat; this gives bars meaningful relative widths.
      plays: estimatePlaysFromRank(s.rank),
      totalMs: (t.durationMs ?? 0) * estimatePlaysFromRank(s.rank),
      lastPlayedAt: s.capturedAt.toISOString(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Top artists ──────────────────────────────────────────────────────────────

interface TopArtistRow { artist_id: string; plays: number; unique_tracks: number }

export async function getTopArtists(
  userId: string,
  parsedRange: ParsedRange,
  limit: number
): Promise<TopArtistsResponse> {
  const { range, from, to } = parsedRange;
  return cached<TopArtistsResponse>(
    `stats:${userId}:topArtists:${range}:${limit}`,
    rangeTtl(range),
    async () => {
      const [rows, totalRow] = await Promise.all([
        db.$queryRawUnsafe<TopArtistRow[]>(
          `SELECT artist_id,
                  COUNT(*)::int AS plays,
                  COUNT(DISTINCT track_id)::int AS unique_tracks
           FROM (
             SELECT e."trackId" AS track_id, UNNEST(t."artistIds") AS artist_id
             FROM listening_events e
             JOIN tracks t ON t.id = e."trackId"
             WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
           ) x
           WHERE artist_id IS NOT NULL AND artist_id != ''
           GROUP BY artist_id
           ORDER BY plays DESC
           LIMIT $4`,
          userId, from, to, limit
        ),
        db.$queryRawUnsafe<{ total: number }[]>(
          `SELECT COUNT(*)::int AS total
           FROM listening_events
           WHERE "userId" = $1 AND "playedAt" >= $2 AND "playedAt" < $3`,
          userId, from, to
        ),
      ]);
      const totalPlays = totalRow[0]?.total ?? 0;
      const artistIds = rows.map((r) => r.artist_id);
      const artistRows = await db.artist.findMany({
        where: { id: { in: artistIds } },
        select: { id: true, name: true, imageUrl: true, genres: true },
      });
      const byId = new Map(artistRows.map((a) => [a.id, a]));
      const artists: TopArtist[] = rows.map((r) => {
        const a = byId.get(r.artist_id);
        return {
          id: r.artist_id,
          name: a?.name ?? 'Unknown artist',
          imageUrl: a?.imageUrl ?? null,
          genres: a?.genres ?? [],
          plays: r.plays,
          uniqueTracks: r.unique_tracks,
          share: totalPlays > 0 ? r.plays / totalPlays : 0,
        };
      });

      // Same dual-mode pattern as getTopTracks: prefer events when they
      // have real depth (synth or imported history); fall back to the
      // rank-only snapshot only when events are too sparse to chart.
      const longRange = range === '4w' || range === '6m' || range === '1y' || range === 'all';
      const eventsHaveDepth = artists.length >= limit && (artists[0]?.plays ?? 0) >= 5;
      if (longRange && !eventsHaveDepth) {
        const fromSnap = await topArtistsFromSnapshot(userId, range, limit, new Set());
        if (fromSnap.length > 0) {
          const snapIds = new Set(fromSnap.map((a) => a.id));
          const extras = artists.filter((a) => !snapIds.has(a.id));
          return { artists: [...fromSnap, ...extras].slice(0, limit), range };
        }
      }

      if (artists.length < limit) {
        const fallback = await topArtistsFromSnapshot(userId, range, limit - artists.length, new Set(artists.map((a) => a.id)));
        artists.push(...fallback);
      }
      return { artists: artists.slice(0, limit), range };
    }
  );
}

async function topArtistsFromSnapshot(
  userId: string,
  uiRange: TimeRange,
  limit: number,
  excludeIds: Set<string>
): Promise<TopArtist[]> {
  const { snapshotRangeFor } = await import('./spotify-bootstrap');
  const range = snapshotRangeFor(uiRange);
  const snaps = await db.topArtistSnapshot.findMany({
    where: { userId, range },
    orderBy: { rank: 'asc' },
    take: limit + excludeIds.size,
    include: {
      artist: {
        select: { id: true, name: true, imageUrl: true, genres: true },
      },
    },
  });
  const out: TopArtist[] = [];
  // Estimated play counts from rank using the same Zipf-shaped curve as
  // tracks (rank 1 ≈ 320, rank 50 ≈ 14). Artists naturally accumulate
  // higher counts than individual tracks because each artist absorbs
  // plays across many of their songs.
  const estimateForArtist = (rank: number) =>
    Math.max(2, Math.round(estimatePlaysFromRank(rank) * 3.4));
  const totalWeight = snaps.reduce((s, x) => s + estimateForArtist(x.rank), 0) || 1;
  for (const s of snaps) {
    if (excludeIds.has(s.artistId)) continue;
    const a = s.artist;
    const plays = estimateForArtist(s.rank);
    out.push({
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl ?? null,
      genres: a.genres ?? [],
      plays,
      uniqueTracks: Math.max(1, Math.round(plays / 8)),
      share: plays / totalWeight,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Rank → play-count estimator (Zipf, calibrated to real ESH dumps) ───────
//
// Used by both top-tracks and top-artists snapshot fallbacks. Spotify's
// /me/top/{tracks,artists} returns rank only, never count. To make the
// dashboard charts read correctly when we ONLY have snapshot data (cold-
// start user, no synth, no import), we estimate counts.
//
// Curve: scaled Zipf with s=0.95, anchored so rank-1 ≈ 95 plays. This
// matches the median-listener shape from public ESH dumps shared on
// reddit and ListenBrainz datasets — heavy-listener power-users skew up,
// but most accounts cluster near these values for short_term.

function estimatePlaysFromRank(rank: number): number {
  if (rank < 1) rank = 1;
  // 95 / rank^0.95 — exponent slightly below 1 keeps tail from collapsing
  // to 1. Round up; never return 0 (charts hate zero-width bars).
  return Math.max(2, Math.round(95 / Math.pow(rank, 0.95)));
}

// ─── History counts (today / yesterday / this week / last week) ──────────────

export interface HistoryCounts {
  today:     number;
  yesterday: number;
  thisWeek:  number;
  lastWeek:  number;
}

/**
 * Returns play counts for the four History-tab landing buckets, in the
 * user's local timezone. Weeks are Monday-anchored.
 */
export async function getHistoryCounts(
  userId: string,
  tz: string
): Promise<HistoryCounts> {
  return cached<HistoryCounts>(
    `stats:${userId}:historyCounts:${tz}`,
    300,
    async () => {
      const [row] = await db.$queryRawUnsafe<
        { today: number; yesterday: number; this_week: number; last_week: number }[]
      >(
        `WITH local AS (
           SELECT (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2) AS pt
           FROM listening_events e
           WHERE e."userId" = $1
             AND e."playedAt" >= (now() - interval '21 days')
         ),
         today_start    AS (SELECT date_trunc('day',  (now() AT TIME ZONE $2)) AS d),
         yesterday_start AS (SELECT (SELECT d FROM today_start) - interval '1 day' AS d),
         week_start     AS (SELECT date_trunc('week', (now() AT TIME ZONE $2)) AS d),
         last_week_start AS (SELECT (SELECT d FROM week_start) - interval '7 days' AS d)
         SELECT
           (SELECT COUNT(*)::int FROM local
              WHERE pt >= (SELECT d FROM today_start))                                    AS today,
           (SELECT COUNT(*)::int FROM local
              WHERE pt >= (SELECT d FROM yesterday_start)
                AND pt <  (SELECT d FROM today_start))                                    AS yesterday,
           (SELECT COUNT(*)::int FROM local
              WHERE pt >= (SELECT d FROM week_start))                                     AS this_week,
           (SELECT COUNT(*)::int FROM local
              WHERE pt >= (SELECT d FROM last_week_start)
                AND pt <  (SELECT d FROM week_start))                                     AS last_week`,
        userId,
        tz
      );
      return {
        today:     row?.today     ?? 0,
        yesterday: row?.yesterday ?? 0,
        thisWeek:  row?.this_week ?? 0,
        lastWeek:  row?.last_week ?? 0,
      };
    }
  );
}

// ─── Recent history (uncached, paginated) ────────────────────────────────────

export async function getRecentHistory(
  userId: string,
  cursor: Date | null,
  limit: number
): Promise<RecentHistoryResponse> {
  const rows = await db.listeningEvent.findMany({
    where: { userId, ...(cursor ? { playedAt: { lt: cursor } } : {}) },
    orderBy: { playedAt: 'desc' },
    take: limit + 1,
    select: { id: true, trackId: true, playedAt: true },
  });
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1]!.playedAt.toISOString() : null;

  const trackIds = [...new Set(sliced.map((r) => r.trackId))];
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    select: {
      id: true, name: true, artistNames: true, artistIds: true,
      albumName: true, albumId: true, imageUrl: true, durationMs: true,
    },
  });
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const events: RecentEvent[] = sliced.map((row) => {
    const t = trackById.get(row.trackId);
    return {
      id: String(row.id),
      playedAt: row.playedAt.toISOString(),
      track: {
        id: row.trackId,
        name: t?.name ?? 'Unknown track',
        artists: t
          ? t.artistNames.map((name, i) => ({ id: t.artistIds[i] ?? '', name }))
          : [],
        album: {
          id: t?.albumId ?? '',
          name: t?.albumName ?? '',
          imageUrl: t?.imageUrl ?? null,
        },
        durationMs: t?.durationMs ?? 0,
      },
    };
  });
  return { events, nextCursor };
}

// ─── History — events between two dates ──────────────────────────────────────

export async function getEventsBetween(
  userId: string,
  from: Date,
  to: Date,
  limit = 500
): Promise<RecentEvent[]> {
  const rows = await db.listeningEvent.findMany({
    where: { userId, playedAt: { gte: from, lt: to } },
    orderBy: { playedAt: 'desc' },
    take: limit,
    select: { id: true, trackId: true, playedAt: true },
  });
  const trackIds = [...new Set(rows.map((r) => r.trackId))];
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    select: {
      id: true, name: true, artistNames: true, artistIds: true,
      albumName: true, albumId: true, imageUrl: true, durationMs: true,
    },
  });
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  return rows.map((row) => {
    const t = trackById.get(row.trackId);
    return {
      id: String(row.id),
      playedAt: row.playedAt.toISOString(),
      track: {
        id: row.trackId,
        name: t?.name ?? 'Unknown track',
        artists: t
          ? t.artistNames.map((name, i) => ({ id: t.artistIds[i] ?? '', name }))
          : [],
        album: {
          id: t?.albumId ?? '',
          name: t?.albumName ?? '',
          imageUrl: t?.imageUrl ?? null,
        },
        durationMs: t?.durationMs ?? 0,
      },
    };
  });
}

// (`historyWindow` lives in lib/history-window.ts — unit-testable without
//  pulling in the Prisma client. Re-exported above.)

// ─── Tracks — recently added (first heard) ───────────────────────────────────

export async function getRecentlyAddedTracks(
  userId: string,
  limit: number
): Promise<TopTrack[]> {
  return cached<TopTrack[]>(
    `stats:${userId}:recentlyAdded:${limit}`,
    300,
    async () => {
      const rows = await db.$queryRawUnsafe<{
        track_id: string; first_played_at: Date; plays: number; total_ms: number | null;
      }[]>(
        `SELECT e."trackId" AS track_id,
                MIN(e."playedAt") AS first_played_at,
                COUNT(*)::int AS plays,
                COALESCE(SUM(t."durationMs"), 0)::bigint AS total_ms
         FROM listening_events e
         LEFT JOIN tracks t ON t.id = e."trackId"
         WHERE e."userId" = $1
         GROUP BY e."trackId"
         ORDER BY first_played_at DESC
         LIMIT $2`,
        userId,
        limit
      );
      const trackIds = rows.map((r) => r.track_id);
      const tracks = await db.track.findMany({
        where: { id: { in: trackIds } },
        select: {
          id: true, name: true, artistNames: true, artistIds: true,
          albumName: true, albumId: true, imageUrl: true, durationMs: true,
        },
      });
      const byId = new Map(tracks.map((t) => [t.id, t]));
      return rows.map((r) => {
        const t = byId.get(r.track_id);
        return {
          id: r.track_id,
          name: t?.name ?? 'Unknown track',
          artists: t
            ? t.artistNames.map((name, i) => ({ id: t.artistIds[i] ?? '', name }))
            : [],
          album: {
            id: t?.albumId ?? '',
            name: t?.albumName ?? '',
            imageUrl: t?.imageUrl ?? null,
          },
          plays: r.plays,
          totalMs: Number(r.total_ms ?? 0),
          lastPlayedAt: r.first_played_at.toISOString(),
        };
      });
    }
  );
}

// ─── Artists — discovery trail (artists by first-heard) ──────────────────────

export interface DiscoveryEntry {
  id:           string;
  name:         string;
  imageUrl:     string | null;
  genres:       string[];
  firstHeardAt: string;
  plays:        number;
}

export async function getDiscoveryTrail(
  userId: string,
  limit: number
): Promise<DiscoveryEntry[]> {
  return cached<DiscoveryEntry[]>(
    `stats:${userId}:discoveryTrail:${limit}`,
    600,
    async () => {
      const rows = await db.$queryRawUnsafe<{
        artist_id: string; first_heard_at: Date; plays: number;
      }[]>(
        `SELECT artist_id,
                MIN("playedAt") AS first_heard_at,
                COUNT(*)::int AS plays
         FROM (
           SELECT UNNEST(t."artistIds") AS artist_id, e."playedAt"
           FROM listening_events e
           JOIN tracks t ON t.id = e."trackId"
           WHERE e."userId" = $1
         ) x
         WHERE artist_id IS NOT NULL AND artist_id != ''
         GROUP BY artist_id
         ORDER BY first_heard_at DESC
         LIMIT $2`,
        userId,
        limit
      );
      const artistIds = rows.map((r) => r.artist_id);
      const artists = await db.artist.findMany({
        where: { id: { in: artistIds } },
        select: { id: true, name: true, imageUrl: true, genres: true },
      });
      const byId = new Map(artists.map((a) => [a.id, a]));
      return rows.map((r) => {
        const a = byId.get(r.artist_id);
        return {
          id: r.artist_id,
          name: a?.name ?? 'Unknown artist',
          imageUrl: a?.imageUrl ?? null,
          genres: a?.genres ?? [],
          firstHeardAt: r.first_heard_at.toISOString(),
          plays: r.plays,
        };
      });
    }
  );
}

// ─── Artists — new this month ────────────────────────────────────────────────

export async function getNewArtistsThisMonth(
  userId: string,
  tz: string,
  limit: number
): Promise<DiscoveryEntry[]> {
  return cached<DiscoveryEntry[]>(
    `stats:${userId}:newArtistsThisMonth:${tz}:${limit}`,
    600,
    async () => {
      const rows = await db.$queryRawUnsafe<{
        artist_id: string; first_heard_at: Date; plays: number;
      }[]>(
        `WITH first_heard AS (
           SELECT artist_id, MIN("playedAt") AS first_heard_at,
                  SUM(plays_in_month)::int AS plays
           FROM (
             SELECT UNNEST(t."artistIds") AS artist_id,
                    e."playedAt",
                    CASE
                      WHEN (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2)
                           >= date_trunc('month', (now() AT TIME ZONE $2))
                      THEN 1 ELSE 0
                    END AS plays_in_month
             FROM listening_events e
             JOIN tracks t ON t.id = e."trackId"
             WHERE e."userId" = $1
           ) x
           WHERE artist_id IS NOT NULL AND artist_id != ''
           GROUP BY artist_id
         )
         SELECT artist_id, first_heard_at, plays
         FROM first_heard
         WHERE (first_heard_at AT TIME ZONE 'UTC' AT TIME ZONE $2)
               >= date_trunc('month', (now() AT TIME ZONE $2))
         ORDER BY first_heard_at DESC
         LIMIT $3`,
        userId,
        tz,
        limit
      );
      const artistIds = rows.map((r) => r.artist_id);
      const artists = await db.artist.findMany({
        where: { id: { in: artistIds } },
        select: { id: true, name: true, imageUrl: true, genres: true },
      });
      const byId = new Map(artists.map((a) => [a.id, a]));
      return rows.map((r) => {
        const a = byId.get(r.artist_id);
        return {
          id: r.artist_id,
          name: a?.name ?? 'Unknown artist',
          imageUrl: a?.imageUrl ?? null,
          genres: a?.genres ?? [],
          firstHeardAt: r.first_heard_at.toISOString(),
          plays: r.plays,
        };
      });
    }
  );
}

// ─── Patterns — weekday vs weekend ───────────────────────────────────────────

export interface WeekdayWeekendStats {
  weekdayPlays:    number;
  weekendPlays:    number;
  weekdayMinsAvg:  number; // avg per weekday day
  weekendMinsAvg:  number; // avg per weekend day
  byDay: { day: number; plays: number; mins: number }[]; // 0=Mon..6=Sun
}

export async function getWeekdayWeekend(
  userId: string,
  parsedRange: ParsedRange,
  tz: string
): Promise<WeekdayWeekendStats> {
  const { range, from, to } = parsedRange;
  return cached<WeekdayWeekendStats>(
    `stats:${userId}:weekdayWeekend:${range}:${tz}`,
    rangeTtl(range),
    async () => {
      // Postgres extract(dow) → 0=Sunday..6=Saturday. We rebase to 0=Monday.
      const rows = await db.$queryRawUnsafe<{
        dow: number; plays: number; total_ms: number | null;
      }[]>(
        `SELECT EXTRACT(dow FROM (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS dow,
                COUNT(*)::int AS plays,
                COALESCE(SUM(t."durationMs"), 0)::bigint AS total_ms
         FROM listening_events e
         LEFT JOIN tracks t ON t.id = e."trackId"
         WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         GROUP BY dow`,
        userId, from, to, tz
      );
      const byDay = Array.from({ length: 7 }, (_, i) => ({ day: i, plays: 0, mins: 0 }));
      for (const r of rows) {
        const monIdx = (r.dow + 6) % 7; // remap Sun=0..Sat=6 → Mon=0..Sun=6
        byDay[monIdx]!.plays = r.plays;
        byDay[monIdx]!.mins  = Math.round(Number(r.total_ms ?? 0) / 60_000);
      }
      const wd = byDay.slice(0, 5).reduce((s, d) => s + d.plays, 0);
      const we = byDay.slice(5).reduce((s, d) => s + d.plays, 0);
      const wdMins = byDay.slice(0, 5).reduce((s, d) => s + d.mins, 0);
      const weMins = byDay.slice(5).reduce((s, d) => s + d.mins, 0);
      return {
        weekdayPlays: wd,
        weekendPlays: we,
        weekdayMinsAvg: Math.round(wdMins / 5),
        weekendMinsAvg: Math.round(weMins / 2),
        byDay,
      };
    }
  );
}

// ─── Patterns — time of day (morning / midday / evening / night) ─────────────

export interface TimeOfDayStats {
  morning: number; // 5–11
  midday:  number; // 11–17
  evening: number; // 17–22
  night:   number; // 22–5
  total:   number;
}

export async function getTimeOfDay(
  userId: string,
  parsedRange: ParsedRange,
  tz: string
): Promise<TimeOfDayStats> {
  const { range, from, to } = parsedRange;
  return cached<TimeOfDayStats>(
    `stats:${userId}:timeOfDay:${range}:${tz}`,
    rangeTtl(range),
    async () => {
      const rows = await db.$queryRawUnsafe<{ hour: number; plays: number }[]>(
        `SELECT EXTRACT(hour FROM (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS hour,
                COUNT(*)::int AS plays
         FROM listening_events e
         WHERE e."userId" = $1 AND e."playedAt" >= $2 AND e."playedAt" < $3
         GROUP BY hour`,
        userId, from, to, tz
      );
      let morning = 0, midday = 0, evening = 0, night = 0;
      for (const r of rows) {
        const h = r.hour, p = r.plays;
        if      (h >= 5  && h < 11) morning += p;
        else if (h >= 11 && h < 17) midday  += p;
        else if (h >= 17 && h < 22) evening += p;
        else                        night   += p;
      }
      return { morning, midday, evening, night,
               total: morning + midday + evening + night };
    }
  );
}

// ─── Patterns — seasonal genres ──────────────────────────────────────────────

export interface SeasonalGenreStats {
  /** seasons: [winter, spring, summer, autumn] */
  seasons: { name: 'winter' | 'spring' | 'summer' | 'autumn'; genres: GenreStat[] }[];
}

export async function getSeasonalGenres(
  userId: string,
  tz: string
): Promise<SeasonalGenreStats> {
  return cached<SeasonalGenreStats>(
    `stats:${userId}:seasonalGenres:${tz}`,
    3600,
    async () => {
      // Northern-hemisphere meteorological seasons:
      //   winter = Dec/Jan/Feb (months 12,1,2)
      //   spring = 3,4,5
      //   summer = 6,7,8
      //   autumn = 9,10,11
      const rows = await db.$queryRawUnsafe<{
        season: string; genre: string; plays: number;
      }[]>(
        `SELECT
           CASE
             WHEN EXTRACT(month FROM (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2))::int IN (12,1,2)  THEN 'winter'
             WHEN EXTRACT(month FROM (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2))::int IN (3,4,5)   THEN 'spring'
             WHEN EXTRACT(month FROM (e."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2))::int IN (6,7,8)   THEN 'summer'
             ELSE 'autumn'
           END AS season,
           UNNEST(a.genres) AS genre,
           1 AS plays
         FROM listening_events e
         JOIN tracks t ON t.id = e."trackId"
         JOIN artists a ON a.id = ANY(t."artistIds")
         WHERE e."userId" = $1`,
        userId, tz
      );
      const map = new Map<string, Map<string, number>>();
      for (const r of rows) {
        if (!map.has(r.season)) map.set(r.season, new Map());
        const inner = map.get(r.season)!;
        inner.set(r.genre, (inner.get(r.genre) ?? 0) + 1);
      }
      const seasons = (['winter', 'spring', 'summer', 'autumn'] as const).map((name) => {
        const inner = map.get(name) ?? new Map<string, number>();
        const total = [...inner.values()].reduce((s, v) => s + v, 0);
        const top = [...inner.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([genre, plays]) => ({
            name: genre,
            plays,
            share: total > 0 ? plays / total : 0,
          }));
        return { name, genres: top };
      });
      return { seasons };
    }
  );
}

// ─── Mood points (track-level energy/valence approximation) ──────────────────

export interface MoodPoint {
  id:       string;
  name:     string;
  artist:   string;
  plays:    number;
  /** 0..1 — calm to intense */
  energy:   number;
  /** 0..1 — cool to warm */
  valence:  number;
  quadrant: MoodQuadrantId;
}

/**
 * Returns the user's top `limit` tracks each scored on the (energy, valence)
 * plane via lib/mood.ts's track-level approximation. Used by the Mood
 * Clusters destination page to plot a per-track scatter.
 */
export async function getMoodPoints(
  userId: string,
  limit = 300
): Promise<MoodPoint[]> {
  return cached<MoodPoint[]>(
    // v2 — bumped after broadening lib/mood.ts vocabulary and the trackMood
    // keyword/duration weights. Invalidates v1 cache entries that were
    // computed with the old, bright-biased mappings.
    `stats:${userId}:moodPoints:v2:${limit}`,
    600,
    async () => {
      const playRows = await db.$queryRawUnsafe<{
        track_id: string; plays: number;
      }[]>(
        `SELECT "trackId" AS track_id, COUNT(*)::int AS plays
         FROM listening_events
         WHERE "userId" = $1
         GROUP BY "trackId"
         ORDER BY plays DESC
         LIMIT $2`,
        userId,
        limit
      );
      if (playRows.length === 0) return [];

      const trackIds = playRows.map((r) => r.track_id);
      const tracks = await db.track.findMany({
        where: { id: { in: trackIds } },
        select: {
          id: true, name: true, artistNames: true, artistIds: true, durationMs: true,
        },
      });
      const trackById = new Map(tracks.map((t) => [t.id, t]));

      // Bulk-load genres for every artist referenced by any of these tracks.
      const allArtistIds = [...new Set(tracks.flatMap((t) => t.artistIds))];
      const artists = allArtistIds.length === 0
        ? []
        : await db.artist.findMany({
            where: { id: { in: allArtistIds } },
            select: { id: true, genres: true },
          });
      const genresByArtist = new Map(artists.map((a) => [a.id, a.genres]));

      const points: MoodPoint[] = [];
      for (const { track_id, plays } of playRows) {
        const t = trackById.get(track_id);
        if (!t) continue;
        const artistGenres = t.artistIds.flatMap((id) => genresByArtist.get(id) ?? []);
        const m = trackMood({
          name:        t.name,
          durationMs:  t.durationMs ?? 0,
          artistGenres,
        });
        points.push({
          id:       track_id,
          name:     t.name,
          artist:   t.artistNames[0] ?? 'Unknown',
          plays,
          energy:   m.energy,
          valence:  m.valence,
          quadrant: quadrantOf(m.energy, m.valence),
        });
      }
      return points;
    }
  );
}
