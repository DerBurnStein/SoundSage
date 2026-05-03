import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { spotifyGet, type SpotifyUser } from '@/lib/spotify';
import { ensureFreshToken } from '@/lib/spotify-tokens';
import logger from '@/lib/logger';

/**
 * One-off action to pull the latest Spotify display name + avatar from
 * /v1/me and persist them. Useful for accounts that connected before we
 * started capturing those fields, and as a manual refresh if a user
 * changes their Spotify display image.
 */
export async function POST(): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { userId } = session;

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 400 }
    );
  }

  const me = await spotifyGet<SpotifyUser>('/me', accessToken);
  const imageUrl = me.images?.[0]?.url ?? null;

  await db.spotifyAccount.update({
    where: { userId },
    data: {
      displayName: me.display_name,
      imageUrl,
    },
  });

  logger.info({ userId, hasImage: !!imageUrl }, 'Spotify profile refreshed');
  return NextResponse.json({
    ok: true,
    displayName: me.display_name,
    imageUrl,
  });
}
