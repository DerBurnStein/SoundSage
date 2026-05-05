// SoundSage — Onboarding state read/write
//
// Read: dashboard fetches this on mount. If `completedAt` is null AND the
// user has Spotify connected, the OnboardingModal opens.
// Write (PATCH): used to mark "skip" (user dismissed without picking) so we
// don't keep re-prompting. The ESH/LastFM/Synthetic endpoints set their own
// completion when their job kicks off, so they don't need to call this.

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface OnboardingState {
  completed: boolean;
  choice: string | null;
  spotifyConnected: boolean;
  hasSyntheticData: boolean;
}

export async function GET(): Promise<NextResponse<OnboardingState>> {
  // Demo sessions need to read state too — the OnboardingModal queries
  // this on every dashboard mount. The pre-seeded demo user has
  // onboardingCompletedAt set, so the modal won't auto-open in demo
  // mode (which is the desired behavior — demo visitors aren't
  // setting up their own data source).
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<OnboardingState>;
  const { userId } = session;

  const [user, spotify, syntheticCount] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { onboardingCompletedAt: true, onboardingChoice: true },
    }),
    db.spotifyAccount.findUnique({ where: { userId }, select: { userId: true } }),
    db.listeningEvent.count({ where: { userId, source: 'synthetic' } }),
  ]);

  return NextResponse.json({
    completed: user?.onboardingCompletedAt != null,
    choice: user?.onboardingChoice ?? null,
    spotifyConnected: spotify != null,
    hasSyntheticData: syntheticCount > 0,
  });
}

const VALID_CHOICES = new Set(['esh', 'lastfm', 'synthetic', 'skip']);

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: { choice?: string };
  try {
    body = (await req.json()) as { choice?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const choice = body.choice ?? '';
  if (!VALID_CHOICES.has(choice)) {
    return NextResponse.json({ error: 'invalid choice' }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.userId },
    data: {
      onboardingCompletedAt: new Date(),
      onboardingChoice: choice,
    },
  });

  logger.info({ userId: session.userId, choice }, 'onboarding: completed');
  return NextResponse.json({ ok: true });
}
