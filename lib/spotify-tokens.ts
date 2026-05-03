import { db } from './db';
import { encrypt, decrypt } from './crypto';
import { SpotifyAuthError } from './spotify';
import logger from './logger';

/**
 * Returns a valid plaintext access token for the given user.
 * Refreshes automatically if the token expires within 5 minutes.
 * Throws SpotifyAuthError if the refresh token has been revoked.
 */
export async function ensureFreshToken(userId: string): Promise<string> {
  const account = await db.spotifyAccount.findUnique({ where: { userId } });
  if (!account) throw new SpotifyAuthError(`No Spotify account linked for user ${userId}`);
  if (account.needsReconnect) throw new SpotifyAuthError('Spotify account needs reconnection');

  // Token still valid — return it
  if (account.expiresAt > new Date(Date.now() + 5 * 60_000)) {
    return decrypt(account.accessToken);
  }

  // Refresh
  logger.info({ userId }, 'Refreshing Spotify access token');

  const refreshToken = decrypt(account.refreshToken);
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (res.status === 400) {
    // Refresh token revoked — user must reconnect
    await db.spotifyAccount.update({
      where: { userId },
      data: { needsReconnect: true, failureCount: { increment: 1 } },
    });
    throw new SpotifyAuthError('Refresh token revoked — user must reconnect Spotify');
  }

  if (!res.ok) {
    throw new Error(`Token refresh failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string; // Spotify sometimes rotates the refresh token
    expires_in: number;
  };

  await db.spotifyAccount.update({
    where: { userId },
    data: {
      accessToken: encrypt(data.access_token),
      // Always persist if Spotify rotates the refresh token
      ...(data.refresh_token && { refreshToken: encrypt(data.refresh_token) }),
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      failureCount: 0,
      needsReconnect: false,
    },
  });

  logger.info({ userId }, 'Spotify token refreshed successfully');
  return data.access_token;
}
