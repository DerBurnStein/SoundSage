import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { redis } from '@/lib/redis';
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

  const jobId = await enqueueSyncTask({ userId });
  logger.info({ userId, jobId }, 'Manual sync triggered');
  return NextResponse.json({ jobId, queued: true });
}
