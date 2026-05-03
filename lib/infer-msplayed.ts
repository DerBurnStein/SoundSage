import { db } from './db';
import logger from './logger';

// Spotify's recently-played API tells us a track WAS played but not how
// much of it the user listened to. We can infer it surprisingly well from
// the gap between consecutive plays:
//
//   inferred ms_played = min(
//     next_play.playedAt - this_play.playedAt,   // upper bound: must end before next play starts
//     track.duration_ms                           // can't have played longer than the track
//   )
//
// Edge cases handled:
//   - Latest play (no "next"): keep existing msPlayed (= track.duration_ms from sync)
//   - Long gap (took a break): capped at track duration (correctly: full play, then silence)
//   - Tracks Spotify excluded from /recently-played (skips <30s): the gap absorbs them.
//     Example: A (3min) → skipped 5s clip → C arrives 3min 5s after A. Gap = 185s,
//     capped at A's duration = 180s. Correct.
//   - Min 30s floor: Spotify's threshold for being included in /recently-played at all.
//
// This only runs over `source='recently_played'` rows. Extended-history
// imports already have actual ms_played from the ZIP, and demo seeds have
// synthesized values.

export interface InferResult {
  updated: number;
  unchanged: number;
}

/**
 * Recomputes msPlayed for all of this user's recently_played events using
 * the gap-to-next-play heuristic. Idempotent.
 */
export async function inferMsPlayedForUser(userId: string): Promise<InferResult> {
  const result = await db.$executeRawUnsafe<number>(
    `WITH ordered AS (
       SELECT
         e.id,
         EXTRACT(EPOCH FROM (
           LEAD(e."playedAt") OVER (
             PARTITION BY e."userId"
             ORDER BY e."playedAt"
           ) - e."playedAt"
         )) * 1000 AS gap_ms,
         t."durationMs" AS dur_ms
       FROM listening_events e
       LEFT JOIN tracks t ON t.id = e."trackId"
       WHERE e."userId" = $1
         AND e.source = 'recently_played'
     )
     UPDATE listening_events e
     SET "msPlayed" = LEAST(
       GREATEST(
         COALESCE(ordered.gap_ms::int, ordered.dur_ms),
         30000
       ),
       ordered.dur_ms
     )
     FROM ordered
     WHERE e.id = ordered.id
       AND ordered.dur_ms IS NOT NULL`,
    userId
  );

  const updated = Number(result);

  logger.info({ userId, updated }, 'msPlayed inference complete');
  return { updated, unchanged: 0 };
}
