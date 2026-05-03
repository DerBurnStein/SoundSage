import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { backfillArtistGenresForUser } from '@/lib/artist-backfill';
import logger from '@/lib/logger';

/**
 * Manually triggers the artist genre backfill for the current user.
 * Idempotent — safe to call repeatedly. Returns a count of artists
 * fetched in this run plus how many remain unsynced.
 *
 * In production this is normally chained automatically after each sync.
 * This endpoint exists for one-off backfill of older accounts and for
 * debugging.
 */
export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;
  logger.info({ userId }, 'Manual genre backfill: starting');

  try {
    const result = await backfillArtistGenresForUser(userId);
    logger.info({ userId, ...result }, 'Manual genre backfill: done');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ userId, err: String(err) }, 'Manual genre backfill: failed');
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
