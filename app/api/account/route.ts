import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { invalidatePrefix } from '@/lib/cache';
import { redis } from '@/lib/redis';
import logger from '@/lib/logger';

/**
 * Permanently deletes the signed-in user's account and all associated data.
 *
 * Cascades (via Prisma's onDelete: Cascade):
 *   - User → Account (NextAuth)
 *   - User → Session (NextAuth)
 *   - User → SpotifyAccount → ListeningEvent
 *
 * Also clears Redis state: stats cache, sync log, manual-trigger rate limits,
 * one-time cleanup flag.
 *
 * The session cookie is cleared by deleting the Session row. Auth.js will
 * see no matching session on the next request.
 */
export async function DELETE(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;
  logger.info({ userId }, 'Account deletion: starting');

  // Cascade-delete the user. All FK relations have onDelete: Cascade in the
  // schema, so this single call removes everything tied to this user.
  await db.user.delete({ where: { id: userId } }).catch((err) => {
    logger.error({ userId, err: String(err) }, 'Account deletion: DB delete failed');
    throw err;
  });

  // Clear all Redis keys scoped to this user. Best-effort — failures here
  // don't block deletion since the DB rows are gone.
  await Promise.allSettled([
    invalidatePrefix(`stats:${userId}:`),
    redis.del(`sync:log:${userId}`),
    redis.del(`sync:trigger:${userId}`),
    redis.del(`artist-cleanup-v2-done:${userId}`),
  ]);

  logger.info({ userId }, 'Account deletion: complete');
  return new NextResponse(null, { status: 204 });
}
