// SoundSage — Last.FM scrobble import endpoint
//
// Accepts a Last.FM username, kicks off a paginated user.getRecentTracks
// import in the background, returns a jobId. UI polls
// /api/import/lastfm/status?jobId= for progress (mirrors ZIP-import shape).

import { type NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAuth } from '@/lib/session';
import { runLastFmImport } from '@/lib/lastfm-scrobbles';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Last.FM usernames: 2-15 chars, alphanumeric + underscore + hyphen.
const USERNAME_RE = /^[A-Za-z0-9_-]{2,15}$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;

  let body: { username?: string };
  try {
    body = (await req.json()) as { username?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const username = (body.username ?? '').trim();
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'invalid username' }, { status: 400 });
  }

  const jobId = randomUUID();
  logger.info({ jobId, userId, username }, 'lastfm: import requested');

  // Mark onboarding completed with this choice. Doing it up-front (before
  // the import resolves) means a network blip doesn't lose the fact that
  // the user picked Last.FM — they can re-trigger from Settings later.
  await db.user
    .update({
      where: { id: userId },
      data: {
        onboardingCompletedAt: new Date(),
        onboardingChoice: 'lastfm',
      },
    })
    .catch((err) => logger.warn({ userId, err: String(err) }, 'lastfm: onboarding flag failed'));

  // Fire-and-forget. The runner writes progress to Redis; the client polls.
  runLastFmImport(jobId, userId, username).catch((err) => {
    logger.error({ jobId, userId, err: String(err) }, 'lastfm: runner crashed');
  });

  return NextResponse.json({ jobId, status: 'running' });
}
