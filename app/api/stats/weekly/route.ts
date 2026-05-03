import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { resolveUserTimezone } from '@/lib/timezone';
import { cached } from '@/lib/cache';
import type { WeeklySpark } from '@/types';

interface Row { week: Date; total_ms: number | null }

export async function GET(req: NextRequest): Promise<NextResponse<WeeklySpark>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<WeeklySpark>;

  const { userId } = session;
  const tz = await resolveUserTimezone(userId, req.nextUrl.searchParams.get('tz'));

  // Always return last 12 ISO weeks regardless of any range query param —
  // this is a fixed sparkline per the contract (types.ts: WeeklySpark.weeks).
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 12 * 7);

  const data = await cached<WeeklySpark>(
    `stats:${userId}:weekly:${tz}`,
    300,
    async () => {
      const rows = await db.$queryRawUnsafe<Row[]>(
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

      // Build a 12-element fixed array, padding zero weeks
      const minsByWeek = new Map<string, number>();
      for (const r of rows) {
        const key = new Date(r.week).toISOString();
        minsByWeek.set(key, Math.round(Number(r.total_ms ?? 0) / 60_000));
      }

      const weeks: number[] = [];
      const cursor = new Date(start);
      // Align cursor to Monday (Postgres date_trunc('week') uses ISO weeks: Mon)
      const day = cursor.getUTCDay(); // 0=Sun..6=Sat
      const monShift = (day + 6) % 7;
      cursor.setUTCDate(cursor.getUTCDate() - monShift);
      cursor.setUTCHours(0, 0, 0, 0);

      for (let i = 0; i < 12; i++) {
        const key = cursor.toISOString();
        weeks.push(minsByWeek.get(key) ?? 0);
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }

      return { weeks };
    }
  );

  return NextResponse.json(data);
}
