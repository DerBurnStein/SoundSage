import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getImportJob } from '@/lib/import-runner';

/**
 * Returns the live state of an import job. Polled by the UI while the
 * progress bar is on screen.
 *
 * Authorization: only the user who started the job can read it.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const state = await getImportJob(jobId);
  if (!state) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (state.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(state);
}
