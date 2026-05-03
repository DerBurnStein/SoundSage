import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { cached } from '@/lib/cache';
import type { TopArtistsResponse, TopArtist } from '@/types';

interface Row {
  artist_id: string;
  plays: number;
  unique_tracks: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse<TopArtistsResponse>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<TopArtistsResponse>;

  const { userId } = session;
  const { range, from, to } = parseRange(req.nextUrl.searchParams.get('range'));

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const ttl = range === '24h' || range === '7d' ? 300 : range === '4w' ? 600 : 3600;

  const data = await cached<TopArtistsResponse>(
    `stats:${userId}:topArtists:${range}:${limit}`,
    ttl,
    async () => {
      // UNNEST track.artistIds so a play counts toward every artist on the
      // track. unique_tracks counts the distinct trackIds the artist appears on.
      const [rows, totalRow] = await Promise.all([
        db.$queryRawUnsafe<Row[]>(
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
          userId,
          from,
          to,
          limit
        ),
        db.$queryRawUnsafe<{ total: number }[]>(
          `SELECT COUNT(*)::int AS total
           FROM listening_events
           WHERE "userId" = $1 AND "playedAt" >= $2 AND "playedAt" < $3`,
          userId,
          from,
          to
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

      return { artists, range };
    }
  );

  return NextResponse.json(data);
}
