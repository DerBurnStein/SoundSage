import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enqueueSyncTask } from '@/lib/tasks';
import logger from '@/lib/logger';

/**
 * Periodic-sync fan-out endpoint.
 *
 * Cloud Scheduler hits this every 15 minutes (or whatever cadence is wired in
 * Cloud Scheduler). Single sync-user POSTs aren't useful here because the
 * worker route expects one userId per call — this route is the enumerator
 * that finds every healthy SpotifyAccount and enqueues one Cloud Task per
 * eligible user.
 *
 * "Eligible" means:
 *   • Has tokens (account exists + needsReconnect = false).
 *   • failureCount < 5 (don't keep retrying broken accounts forever; a manual
 *     /api/sync/trigger from the user resets failureCount).
 *   • lastSyncAt is null OR older than 15 minutes (avoids double-syncing
 *     someone who just kicked off a manual trigger).
 *
 * Return 200 with the enqueued count; 5xx only for transient DB failures
 * since Cloud Scheduler retries 5xx but treats 4xx as permanent.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Same auth gate as sync-user. The Cloud Scheduler job sends
  // X-CloudTasks-QueueName as a static header so this endpoint is reachable
  // from infra but not from random traffic. Full OIDC verification would
  // strengthen this before public exposure.
  if (process.env.NODE_ENV === 'production') {
    const queueName = req.headers.get('X-CloudTasks-QueueName');
    if (!queueName) {
      logger.warn('sync-all: rejected request missing queue header');
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // 15 min staleness threshold matches the cron cadence — anyone synced more
  // recently than that has nothing new to fetch yet.
  const threshold = new Date(Date.now() - 15 * 60 * 1000);

  let accounts: { userId: string }[];
  try {
    accounts = await db.spotifyAccount.findMany({
      where: {
        needsReconnect: false,
        failureCount: { lt: 5 },
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: threshold } },
        ],
      },
      select: { userId: true },
    });
  } catch (err) {
    logger.error({ err: String(err) }, 'sync-all: failed to enumerate accounts');
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  if (accounts.length === 0) {
    return NextResponse.json({ enqueued: 0, message: 'no eligible accounts' });
  }

  // Enqueue tasks in parallel — `enqueueSyncTask` already handles the dev vs
  // prod branch (direct call vs Cloud Tasks). Promise.allSettled so a single
  // failure doesn't take down the whole batch.
  const results = await Promise.allSettled(
    accounts.map((a) => enqueueSyncTask({ userId: a.userId }))
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - ok;

  if (failed > 0) {
    logger.warn(
      { ok, failed, total: results.length },
      'sync-all: some enqueues failed (continuing — others succeeded)'
    );
  }

  return NextResponse.json({
    enqueued: ok,
    failed,
    total: results.length,
  });
}
