import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { backfillTrackMetadataForUser } from '@/lib/track-backfill';
import logger from '@/lib/logger';

/**
 * Manually triggers the track-metadata backfill: fills missing artistIds /
 * albumId / imageUrl on legacy Track rows by calling /v1/tracks/{id}.
 *
 * Useful one-off action for accounts whose data was synced before some
 * Track columns were added. New syncs already capture this data correctly.
 */
export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;
  logger.info({ userId }, 'Manual track backfill: starting');

  try {
    const result = await backfillTrackMetadataForUser(userId);
    logger.info({ userId, ...result }, 'Manual track backfill: done');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ userId, err: String(err) }, 'Manual track backfill: failed');
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
