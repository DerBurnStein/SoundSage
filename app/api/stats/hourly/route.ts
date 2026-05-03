import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { cached } from '@/lib/cache';
import type { HourlyStats } from '@/types';

interface Row { hour: number; plays: number }

export async function GET(req: NextRequest): Promise<NextResponse<HourlyStats>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<HourlyStats>;

  const { userId } = session;
  const { range, from, to } = parseRange(req.nextUrl.searchParams.get('range'));
  const tz = await resolveUserTimezone(
    userId,
    req.nextUrl.searchParams.get('tz')
  );

  const ttl = range === '24h' || range === '7d' ? 300 : 3600;

  const data = await cached<HourlyStats>(
    `stats:${userId}:hourly:${range}:${tz}`,
    ttl,
    async () => {
      const rows = await db.$queryRawUnsafe<Row[]>(
        `SELECT EXTRACT(hour FROM ("playedAt" AT TIME ZONE 'UTC' AT TIME ZONE $4))::int AS hour,
                COUNT(*)::int AS plays
         FROM listening_events
         WHERE "userId" = $1 AND "playedAt" >= $2 AND "playedAt" < $3
         GROUP BY hour
         ORDER BY hour`,
        userId,
        from,
        to,
        tz
      );

      const byHour = new Map(rows.map((r) => [r.hour, r.plays]));
      const buckets = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        plays: byHour.get(hour) ?? 0,
      }));

      return { buckets };
    }
  );

  return NextResponse.json(data);
}
