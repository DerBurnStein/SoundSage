import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getActivity } from '@/lib/sync-progress';

/**
 * GET /api/sync/activity — last N lines of the live activity stream
 * (Spotify calls, DB writes, etc.). Used by the SyncCard's "behind the
 * scenes" pane to surface what's actually happening during a sync.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error;
  const lines = await getActivity(session.userId, 20);
  return NextResponse.json(
    { lines },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
