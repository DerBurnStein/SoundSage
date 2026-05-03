import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { getSpotifyConnection } from '@/lib/page-data';
import { invalidatePrefix } from '@/lib/cache';
import logger from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;
  return NextResponse.json(await getSpotifyConnection(session.userId));
}

export async function DELETE(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  await db.spotifyAccount.delete({ where: { userId: session.userId } }).catch(() => {
    // Already disconnected — not an error
  });
  await invalidatePrefix(`stats:${session.userId}:`);

  logger.info({ userId: session.userId }, 'Spotify account disconnected');
  return new NextResponse(null, { status: 204 });
}
