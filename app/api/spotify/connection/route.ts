import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import logger from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const account = await db.spotifyAccount.findUnique({
    where: { userId: session.userId },
    select: {
      spotifyUserId: true,
      lastSyncAt: true,
      needsReconnect: true,
      failureCount: true,
      scopes: true,
    },
  });

  if (!account) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    spotifyUserId: account.spotifyUserId,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    needsReconnect: account.needsReconnect,
    failureCount: account.failureCount,
    scopes: account.scopes,
  });
}

export async function DELETE(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  await db.spotifyAccount.delete({ where: { userId: session.userId } }).catch(() => {
    // Already disconnected — not an error
  });

  logger.info({ userId: session.userId }, 'Spotify account disconnected');
  return new NextResponse(null, { status: 204 });
}
