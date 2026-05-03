import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { cached } from '@/lib/cache';
import type { ActivityStats } from '@/types';

interface Row { bucket: Date; plays: number; total_ms: number | null }

const ALLOWED_GRAIN = new Set(['day', 'week', 'month']);

export async function GET(req: NextRequest): Promise<NextResponse<ActivityStats>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<ActivityStats>;

  const { userId } = session;
  const params = req.nextUrl.searchParams;
  const { range, from, to, grain: defaultGrain } = parseRange(params.get('range'));

  const requested = params.get('grain');
  const grain: 'day' | 'week' | 'month' = ALLOWED_GRAIN.has(requested ?? '')
    ? (requested as 'day' | 'week' | 'month')
    : defaultGrain === 'hour'
    ? 'day'
    : (defaultGrain as 'day' | 'week' | 'month');

  const tz = await resolveUserTimezone(userId, params.get('tz'));
  const ttl = range === '24h' || range === '7d' || range === '4w' ? 300 : 3600;

  // Track durations are joined via Track.id = listening_events.track_id.
  // Events without a Track row contribute 0 ms (LEFT JOIN with COALESCE).
  const data = await cached<ActivityStats>(
    `stats:${userId}:activity:${range}:${grain}:${tz}`,
    ttl,
    async () => {
      const rows = await db.$queryRawUnsafe<Row[]>(
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
        mins: Math.round((Number(r.total_ms ?? 0)) / 60_000),
      }));

      return { buckets, grain };
    }
  );

  return NextResponse.json(data);
}
