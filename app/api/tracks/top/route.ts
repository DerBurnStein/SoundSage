import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { cached } from '@/lib/cache';
import type { TopTracksResponse, TopTrack } from '@/types';

interface Row {
  track_id: string;
  plays: number;
  total_ms: number | null;
  last_played_at: Date;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse<TopTracksResponse>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<TopTracksResponse>;

  const { userId } = session;
  const { range, from, to } = parseRange(req.nextUrl.searchParams.get('range'));

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const ttl = range === '24h' || range === '7d' ? 300 : range === '4w' ? 600 : 3600;

  const data = await cached<TopTracksResponse>(
    `stats:${userId}:topTracks:${range}:${limit}`,
    ttl,
    async () => {
      const rows = await db.$queryRawUnsafe<Row[]>(
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
          id: true,
          name: true,
          artistNames: true,
          artistIds: true,
          albumName: true,
          albumId: true,
          imageUrl: true,
          durationMs: true,
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
            ? t.artistNames.map((name, i) => ({
                id: t.artistIds[i] ?? '',
                name,
              }))
            : [],
          album: {
            id: t?.albumId ?? '',
            name: t?.albumName ?? '',
            imageUrl: t?.imageUrl ?? null,
          },
          plays: playCount,
          // total_ms from the raw query is a single track's duration * row count,
          // but Postgres SUM(durationMs) over a GROUP BY trackId returns
          // duration * play_count which is what we want.
          totalMs: Number(r.total_ms ?? perPlayMs * playCount),
          lastPlayedAt: r.last_played_at.toISOString(),
        };
      });

      return { tracks: top, range };
    }
  );

  return NextResponse.json(data);
}
