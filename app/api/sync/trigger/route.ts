import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { enqueueSyncTask } from '@/lib/tasks';
import logger from '@/lib/logger';

export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;

  // Rate limit: one manual trigger per 60 seconds per user
  const key = `sync:trigger:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);

  if (count > 1) {
    const ttl = await redis.ttl(key);
    return NextResponse.json(
      { error: 'Too soon — wait before triggering another sync.' },
      { status: 429, headers: { 'Retry-After': String(ttl) } }
    );
  }

  // First-run snapshot bootstrap: if EITHER snapshot table is empty for this
  // user, re-run the Top-Items fetch in the background. We check both because
  // an early bug let track snapshots succeed while artist snapshots silently
  // failed (50 sequential upserts inside a transaction blew past the Prisma
  // 5s timeout — fixed in spotify-bootstrap.ts, but we still need to recover
  // accounts that landed in the half-populated state).
  const [trackSnapshotCount, artistSnapshotCount] = await Promise.all([
    db.topTrackSnapshot.count({ where: { userId } }),
    db.topArtistSnapshot.count({ where: { userId } }),
  ]);
  const needsBootstrap = trackSnapshotCount === 0 || artistSnapshotCount === 0;
  if (needsBootstrap) {
    logger.info(
      { userId, trackSnapshotCount, artistSnapshotCount },
      'Snapshot tables incomplete — kicking off bootstrap'
    );
    import('@/lib/spotify-bootstrap')
      .then(({ bootstrapTopItems }) => bootstrapTopItems(userId))
      .catch((err) =>
        logger.warn({ userId, err: String(err) }, 'Top-items bootstrap failed (non-fatal)')
      );
  }

  const jobId = await enqueueSyncTask({ userId });
  logger.info({ userId, jobId, trackSnapshotCount, artistSnapshotCount }, 'Manual sync triggered');
  return NextResponse.json({ jobId, queued: true, bootstrapped: needsBootstrap });
}
