import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getLastFmJob } from '@/lib/lastfm-scrobbles';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  const state = await getLastFmJob(jobId);
  if (!state) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (state.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(state);
}
