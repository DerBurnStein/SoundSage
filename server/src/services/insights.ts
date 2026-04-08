import { pool } from '../utils/db';

export interface DashboardSummary {
  totals: {
    plays: number;
    distinctTracks: number;
    distinctArtists: number;
  };
  busiestHourUtc: number | null;
  busiestWeekdayUtc: number | null;
  averageSessionLengthMinutes: number;
  topTracks: Array<{ trackName: string; plays: number }>;
  topArtists: Array<{ artistName: string; plays: number }>;
}

export async function getDashboardSummary(userId: string, days: number): Promise<DashboardSummary> {
  const [totals, busiestHour, busiestWeekday, sessionAverage, topTracks, topArtists] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*)::int AS plays,
        COUNT(DISTINCT spotify_track_id)::int AS distinct_tracks,
        COUNT(DISTINCT artist)::int AS distinct_artists
      FROM (
        SELECT spotify_track_id, UNNEST(artist_names) AS artist
        FROM play_events
        WHERE user_id = $1
          AND played_at >= NOW() - (($2 || ' days')::interval)
      ) flattened
      `,
      [userId, days]
    ),
    pool.query(
      `
      SELECT EXTRACT(HOUR FROM played_at)::int AS hour_utc, COUNT(*)::int AS plays
      FROM play_events
      WHERE user_id = $1
        AND played_at >= NOW() - (($2 || ' days')::interval)
      GROUP BY hour_utc
      ORDER BY plays DESC, hour_utc ASC
      LIMIT 1
      `,
      [userId, days]
    ),
    pool.query(
      `
      SELECT EXTRACT(DOW FROM played_at)::int AS weekday_utc, COUNT(*)::int AS plays
      FROM play_events
      WHERE user_id = $1
        AND played_at >= NOW() - (($2 || ' days')::interval)
      GROUP BY weekday_utc
      ORDER BY plays DESC, weekday_utc ASC
      LIMIT 1
      `,
      [userId, days]
    ),
    pool.query(
      `
      WITH ordered AS (
        SELECT
          played_at,
          LAG(played_at) OVER (ORDER BY played_at) AS prev_played_at
        FROM play_events
        WHERE user_id = $1
          AND played_at >= NOW() - (($2 || ' days')::interval)
      ),
      marked AS (
        SELECT
          played_at,
          CASE
            WHEN prev_played_at IS NULL OR played_at - prev_played_at > INTERVAL '30 minutes' THEN 1
            ELSE 0
          END AS new_session
        FROM ordered
      ),
      grouped AS (
        SELECT
          played_at,
          SUM(new_session) OVER (ORDER BY played_at) AS session_id
        FROM marked
      )
      SELECT COALESCE(AVG(session_minutes), 0)::float AS avg_session_minutes
      FROM (
        SELECT
          EXTRACT(EPOCH FROM MAX(played_at) - MIN(played_at)) / 60.0 AS session_minutes
        FROM grouped
        GROUP BY session_id
      ) sessions
      `,
      [userId, days]
    ),
    pool.query(
      `
      SELECT track_name, COUNT(*)::int AS plays
      FROM play_events
      WHERE user_id = $1
        AND played_at >= NOW() - (($2 || ' days')::interval)
      GROUP BY track_name
      ORDER BY plays DESC, track_name ASC
      LIMIT 5
      `,
      [userId, days]
    ),
    pool.query(
      `
      SELECT artist_name, COUNT(*)::int AS plays
      FROM (
        SELECT UNNEST(artist_names) AS artist_name
        FROM play_events
        WHERE user_id = $1
          AND played_at >= NOW() - (($2 || ' days')::interval)
      ) artists
      GROUP BY artist_name
      ORDER BY plays DESC, artist_name ASC
      LIMIT 5
      `,
      [userId, days]
    )
  ]);

  return {
    totals: {
      plays: totals.rows[0]?.plays ?? 0,
      distinctTracks: totals.rows[0]?.distinct_tracks ?? 0,
      distinctArtists: totals.rows[0]?.distinct_artists ?? 0
    },
    busiestHourUtc: busiestHour.rows[0]?.hour_utc ?? null,
    busiestWeekdayUtc: busiestWeekday.rows[0]?.weekday_utc ?? null,
    averageSessionLengthMinutes: Number(sessionAverage.rows[0]?.avg_session_minutes ?? 0),
    topTracks: topTracks.rows.map((row) => ({ trackName: row.track_name as string, plays: row.plays as number })),
    topArtists: topArtists.rows.map((row) => ({ artistName: row.artist_name as string, plays: row.plays as number }))
  };
}

export async function getRecentEvents(userId: string, limit: number) {
  const result = await pool.query(
    `
    SELECT played_at, track_name, artist_names, album_name, duration_ms
    FROM play_events
    WHERE user_id = $1
    ORDER BY played_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}
