import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { cached } from '@/lib/cache';
import type { GenreStats, GenreStat } from '@/types';

interface Row {
  genre: string;
  plays: number;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest): Promise<NextResponse<GenreStats>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<GenreStats>;

  const { userId } = session;
  const { range, from, to } = parseRange(req.nextUrl.searchParams.get('range'));

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const ttl = range === '24h' || range === '7d' ? 300 : range === '4w' ? 600 : 3600;

  const data = await cached<GenreStats>(
    `stats:${userId}:genres:${range}:${limit}`,
    ttl,
    async () => {
      // Two UNNESTs: track.artistIds → artist → artist.genres. Each play
      // contributes once per genre per artist (so a 3-genre artist's track
      // counts 3x toward genre totals — matches Spotify's own approach).
      const rows = await db.$queryRawUnsafe<Row[]>(
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

      if (rows.length === 0) {
        return { genres: [] };
      }

      const totalPlays = rows.reduce((sum, r) => sum + r.plays, 0);
      const top = rows.slice(0, limit);
      const tail = rows.slice(limit);

      const genres: GenreStat[] = top.map((r) => ({
        name: r.genre,
        plays: r.plays,
        share: totalPlays > 0 ? r.plays / totalPlays : 0,
      }));

      // Long-tail bucketed under "other" if there's anything left
      if (tail.length > 0) {
        const otherPlays = tail.reduce((sum, r) => sum + r.plays, 0);
        genres.push({
          name: 'other',
          plays: otherPlays,
          share: totalPlays > 0 ? otherPlays / totalPlays : 0,
        });
      }

      return { genres };
    }
  );

  return NextResponse.json(data);
}
