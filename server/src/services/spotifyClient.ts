import { pool } from '../utils/db';
import { decryptToken, encryptToken } from '../utils/tokenCrypto';

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function getTokenRow(userId: string): Promise<TokenRow> {
  const result = await pool.query<TokenRow>(
    'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );

  if (!result.rowCount) {
    throw new Error('OAuth token row not found');
  }

  return result.rows[0];
}

async function refreshSpotifyAccessToken(userId: string, refreshToken: string): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('SPOTIFY_CLIENT_ID missing');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    throw new Error('Could not refresh Spotify token');
  }

  const data = await response.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const nextRefreshToken = data.refresh_token ?? refreshToken;

  await pool.query(
    `
    UPDATE oauth_tokens
    SET
      access_token = $2,
      refresh_token = $3,
      expires_at = NOW() + (($4 || ' seconds')::interval),
      updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, encryptToken(data.access_token), encryptToken(nextRefreshToken), data.expires_in]
  );

  return data.access_token;
}

export async function getValidSpotifyAccessToken(userId: string): Promise<string> {
  const tokenRow = await getTokenRow(userId);
  const expiresAt = new Date(tokenRow.expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now > 60_000) {
    return decryptToken(tokenRow.access_token);
  }

  return refreshSpotifyAccessToken(userId, decryptToken(tokenRow.refresh_token));
}

export async function fetchRecentlyPlayed(userId: string, limit = 50) {
  const accessToken = await getValidSpotifyAccessToken(userId);

  const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch recently played from Spotify');
  }

  return response.json() as Promise<{
    items: Array<{
      played_at: string;
      context: { uri?: string | null } | null;
      track: {
        id: string;
        name: string;
        duration_ms?: number;
        album?: { name?: string };
        artists?: Array<{ name?: string }>;
      };
    }>;
  }>;
}
