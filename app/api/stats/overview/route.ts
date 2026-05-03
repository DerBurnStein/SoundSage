import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { cached } from '@/lib/cache';
import type { OverviewStats } from '@/types';

interface OverviewRow {
  total_plays: number;
  unique_tracks: number;
  total_ms: number | null;
  top_hour: number | null;
  new_artists: number;
  range_artists: number;
}

export async function GET(req: NextRequest): Promise<NextResponse<OverviewStats>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<OverviewStats>;

  const { userId } = session;
  const { range, from, to } = parseRange(req.nextUrl.searchParams.get('range'));
  const tz = await resolveUserTimezone(userId, req.nextUrl.searchParams.get('tz'));

  const ttl = range === '24h' || range === '7d' ? 300 : range === '4w' ? 600 : 3600;

  const stats = await cached<OverviewStats>(
    `stats:${userId}:overview:${range}:${tz}`,
    ttl,
    async () => {
      // Single round-trip: aggregate counts, total ms, top hour, plus
      // discovery (artists in window that don't appear before window).
      // Uses LEFT JOIN to tracks so events with missing track metadata still
      // count toward plays — we just lose ms for those.
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

  return NextResponse.json(stats);
}
