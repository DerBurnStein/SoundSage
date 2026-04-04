const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function upsertSpotifyUserTokens(input) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      INSERT INTO users (id, spotify_user_id, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (spotify_user_id)
      DO UPDATE SET display_name = EXCLUDED.display_name
      `,
      [input.userId, input.spotifyUserId, input.displayName]
    );

    await client.query(
      `
      INSERT INTO oauth_tokens (
        user_id,
        access_token,
        refresh_token,
        scope,
        expires_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        scope = EXCLUDED.scope,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [input.userId, input.accessToken, input.refreshToken, input.scope, input.expiresAt]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, upsertSpotifyUserTokens };
