import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { inferMsPlayedForUser } from '@/lib/infer-msplayed';
import { invalidatePrefix } from '@/lib/cache';
import logger from '@/lib/logger';

/**
 * Recomputes ms_played for all of this user's recently-played events
 * using the gap-to-next-play heuristic. One-off backfill action; the
 * sync runner now does this incrementally.
 */
export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;
  logger.info({ userId }, 'Manual msPlayed inference: starting');

  try {
    const result = await inferMsPlayedForUser(userId);
    // Cached stats use msPlayed indirectly; drop them so next page reads fresh.
    await invalidatePrefix(`stats:${userId}:`);
    logger.info({ userId, ...result }, 'Manual msPlayed inference: done');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ userId, err: String(err) }, 'Manual msPlayed inference: failed');
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
