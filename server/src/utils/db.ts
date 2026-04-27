import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export interface StoredSpotifyUser {
  userId: string;
  spotifyUserId: string;
  displayName: string | null;
  email: string | null;
  country: string | null;
  productTier: string | null;
  accessToken: string;
  refreshToken: string;
  scope: string | null;
  expiresAt: Date;
}

export interface GoogleIdentityInput {
  googleSubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

export interface PlayEventInput {
  userId: string;
  spotifyTrackId: string;
  playedAt: string;
  trackName: string;
  artistNames: string[];
  albumName: string | null;
  durationMs: number | null;
  contextUri: string | null;
  rawPayload: unknown;
}

export async function upsertGoogleIdentityUser(input: GoogleIdentityInput): Promise<{ id: string; spotifyUserId: string | null; displayName: string | null }> {
  const result = await pool.query<{ id: string; spotify_user_id: string | null; display_name: string | null }>(
    `
    INSERT INTO users (google_subject, email, email_verified, display_name, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (google_subject)
    DO UPDATE SET
      email = EXCLUDED.email,
      email_verified = EXCLUDED.email_verified,
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
    RETURNING id, spotify_user_id, display_name
    `,
    [input.googleSubject, input.email, input.emailVerified, input.displayName]
  );

  return {
    id: result.rows[0].id,
    spotifyUserId: result.rows[0].spotify_user_id,
    displayName: result.rows[0].display_name
  };
}

export async function upsertSpotifyUserTokens(input: StoredSpotifyUser): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingBySpotify = await client.query<{ id: string }>('SELECT id FROM users WHERE spotify_user_id = $1', [input.spotifyUserId]);
    const existingById = await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [input.userId]);

    const resolvedUserId = existingBySpotify.rowCount
      ? existingBySpotify.rows[0].id
      : existingById.rowCount
      ? existingById.rows[0].id
      : input.userId;

    await client.query(
      `
      INSERT INTO users (id, spotify_user_id, display_name, email, country, product_tier, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        spotify_user_id = EXCLUDED.spotify_user_id,
        display_name = COALESCE(EXCLUDED.display_name, users.display_name),
        email = COALESCE(users.email, EXCLUDED.email),
        country = EXCLUDED.country,
        product_tier = EXCLUDED.product_tier,
        updated_at = NOW()
      `,
      [resolvedUserId, input.spotifyUserId, input.displayName, input.email, input.country, input.productTier]
    );

    await client.query(
      `
      INSERT INTO oauth_tokens (user_id, access_token, refresh_token, scope, expires_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        scope = EXCLUDED.scope,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [resolvedUserId, input.accessToken, input.refreshToken, input.scope, input.expiresAt]
    );

    await client.query(
      `
      INSERT INTO ingestion_state (user_id, created_at, updated_at)
      VALUES ($1, NOW(), NOW())
      ON CONFLICT (user_id)
      DO NOTHING
      `,
      [resolvedUserId]
    );

    await client.query('COMMIT');
    return resolvedUserId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function insertPlayEvents(events: PlayEventInput[]): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query('BEGIN');

    for (const event of events) {
      const result = await client.query(
        `
        INSERT INTO play_events (
          user_id,
          spotify_track_id,
          played_at,
          track_name,
          artist_names,
          album_name,
          duration_ms,
          context_uri,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, spotify_track_id, played_at)
        DO NOTHING
        `,
        [
          event.userId,
          event.spotifyTrackId,
          event.playedAt,
          event.trackName,
          event.artistNames,
          event.albumName,
          event.durationMs,
          event.contextUri,
          JSON.stringify(event.rawPayload)
        ]
      );

      inserted += result.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateIngestionState(userId: string, latestPlayedAt: string | null, insertedCount: number): Promise<void> {
  await pool.query(
    `
    UPDATE ingestion_state
    SET
      last_played_at = COALESCE($2::timestamptz, last_played_at),
      last_run_at = NOW(),
      total_events_ingested = total_events_ingested + $3,
      updated_at = NOW()
    WHERE user_id = $1
    `,
    [userId, latestPlayedAt, insertedCount]
  );
}

export async function deleteUserData(userId: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}
