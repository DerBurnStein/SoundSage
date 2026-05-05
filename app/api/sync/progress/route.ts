import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getProgress } from '@/lib/sync-progress';

/**
 * GET /api/sync/progress — current state of the user's most recent sync.
 *
 * Returns null when no sync has run in the last 10 min (Redis TTL). Both
 * the SyncCard and the Settings popover poll this every 500-1000ms while
 * `done` is false, then drop the cadence to 30s once the sync settles.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error;
  const progress = await getProgress(session.userId);
  return NextResponse.json(
    { progress },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
