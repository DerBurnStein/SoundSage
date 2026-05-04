// SoundSage — Synthetic history endpoint
//
// Triggered when the user picks "Use synthetic data" in onboarding (or
// re-runs from Settings). Synchronously generates a plausible play log so
// every chart is populated immediately. Marked source='synthetic' and
// replaced wholesale when ESH or Last.FM data arrives.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { generateSyntheticHistory } from '@/lib/synthetic-history';
import { db } from '@/lib/db';
import { invalidatePrefix } from '@/lib/cache';
import logger from '@/lib/logger';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;

  try {
    const result = await generateSyntheticHistory(userId);

    await db.user
      .update({
        where: { id: userId },
        data: {
          onboardingCompletedAt: new Date(),
          onboardingChoice: 'synthetic',
        },
      })
      .catch((err) =>
        logger.warn({ userId, err: String(err) }, 'synthetic: onboarding flag failed')
      );

    await invalidatePrefix(`stats:${userId}:`);

    logger.info({ userId, result }, 'synthetic: generation complete');
    return NextResponse.json({
      ok: true,
      totalPlaysGenerated: result.totalPlaysGenerated,
      byRange: result.byRange,
    });
  } catch (err) {
    logger.error({ userId, err: String(err) }, 'synthetic: generation failed');
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
