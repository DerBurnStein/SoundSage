// SoundSage — sync progress + activity stream
//
// Surfaces real-time information about an in-flight sync to the dashboard.
// Two Redis-backed channels:
//
//   • `sync:progress:<userId>` — single JSON blob with the latest stage,
//     percent, and message. Cleared at sync end. Polled by SyncCard +
//     SettingsButton's progress bars to drive *real* progress instead of
//     a fake easing curve.
//   • `sync:activity:<userId>` — capped Redis list of recent activity
//     lines ("→ GET /v1/me/player/recently-played", "✓ inserted 12
//     events", "↻ refreshing access token"). Renders as the live
//     "behind the scenes" pane below the SyncCard.
//
// Both keys auto-expire after 10 minutes so they don't accumulate forever
// for inactive users — a poll that returns nothing means the sync is
// either done or never started.

import { redis } from './redis';

export interface SyncProgress {
  /** Stable key identifying which phase the worker is in. */
  stage: SyncStage;
  /** 0..100. Driven by the stage map below; never goes backwards. */
  percent: number;
  /** Human-readable status line shown next to the bar. */
  msg: string;
  /** Unix ms — used by clients to detect stale state. */
  startedAt: number;
  /** Unix ms — last time the worker pushed an update. */
  updatedAt: number;
  /** True after the sync function returns (success or failure). */
  done: boolean;
  /** Set when done=true and an error was caught. */
  error?: string;
}

export type SyncStage =
  | 'queued'
  | 'token'
  | 'fetch'
  | 'persist'
  | 'metadata'
  | 'finalize'
  | 'done'
  | 'error';

// Each stage has a target percent. The worker advances by setting
// stage; percent is taken from this map so the bar never lies. We
// reserve 100% strictly for stage='done', so the bar only fills
// completely on confirmed success.
const STAGE_PERCENTS: Record<SyncStage, number> = {
  queued:   5,
  token:    15,
  fetch:    35,
  persist:  60,
  metadata: 80,
  finalize: 95,
  done:     100,
  error:    100,
};

const PROGRESS_KEY = (userId: string) => `sync:progress:${userId}`;
const ACTIVITY_KEY = (userId: string) => `sync:activity:${userId}`;
const KEY_TTL_SEC = 600; // 10 min — cleaned up if the worker dies mid-sync
const ACTIVITY_CAP = 30; // last 30 lines kept

export interface ActivityLine {
  /** Unix ms */
  ts: number;
  /** One-character glyph: → outbound call, ✓ success, ⚠ warning, ↻ retry, … in-flight */
  kind: '→' | '✓' | '⚠' | '↻' | '…';
  /** Short message — keep under 80 chars so it renders on one row */
  msg: string;
}

/**
 * Mark the start of a sync. Resets progress + clears prior activity so
 * a brand-new run shows a clean stream rather than mixing with the last.
 */
export async function syncStart(userId: string): Promise<void> {
  const now = Date.now();
  const initial: SyncProgress = {
    stage: 'queued',
    percent: STAGE_PERCENTS.queued,
    msg: 'Sync queued',
    startedAt: now,
    updatedAt: now,
    done: false,
  };
  await Promise.all([
    redis.set(PROGRESS_KEY(userId), JSON.stringify(initial), 'EX', KEY_TTL_SEC),
    redis.del(ACTIVITY_KEY(userId)),
  ]);
  await activity(userId, '…', 'sync started');
}

/**
 * Advance the progress bar to a new stage. Idempotent — calling with the
 * same stage twice is fine; the message just updates. Never lets percent
 * regress (clients hate that).
 */
export async function syncStage(
  userId: string,
  stage: SyncStage,
  msg: string
): Promise<void> {
  const cur = await getProgress(userId);
  const targetPct = STAGE_PERCENTS[stage];
  const next: SyncProgress = {
    stage,
    percent: cur ? Math.max(cur.percent, targetPct) : targetPct,
    msg,
    startedAt: cur?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
    done: stage === 'done' || stage === 'error',
    ...(stage === 'error' ? { error: msg } : {}),
  };
  await redis.set(PROGRESS_KEY(userId), JSON.stringify(next), 'EX', KEY_TTL_SEC);
}

/**
 * Append one line to the activity feed. Capped at ACTIVITY_CAP entries
 * via LTRIM so a long sync doesn't blow up Redis memory.
 */
export async function activity(
  userId: string,
  kind: ActivityLine['kind'],
  msg: string
): Promise<void> {
  const line: ActivityLine = { ts: Date.now(), kind, msg };
  const key = ACTIVITY_KEY(userId);
  // Run as a pipeline so a single Redis round-trip handles both ops.
  const pipe = redis.pipeline();
  pipe.lpush(key, JSON.stringify(line));
  pipe.ltrim(key, 0, ACTIVITY_CAP - 1);
  pipe.expire(key, KEY_TTL_SEC);
  await pipe.exec();
}

/** Read latest progress (null if never started or expired). */
export async function getProgress(userId: string): Promise<SyncProgress | null> {
  const raw = await redis.get(PROGRESS_KEY(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncProgress;
  } catch {
    return null;
  }
}

/** Read the last N activity lines (newest first). */
export async function getActivity(
  userId: string,
  limit = ACTIVITY_CAP
): Promise<ActivityLine[]> {
  const raw = await redis.lrange(ACTIVITY_KEY(userId), 0, limit - 1);
  return raw
    .map((s) => {
      try {
        return JSON.parse(s) as ActivityLine;
      } catch {
        return null;
      }
    })
    .filter((x): x is ActivityLine => x !== null);
}
