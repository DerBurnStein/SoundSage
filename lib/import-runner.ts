import { db } from './db';
import { redis } from './redis';
import { invalidatePrefix } from './cache';
import { parseSpotifyHistoryZip, type ParsedHistoryEvent, type ParseStats } from './import-parser';
import logger from './logger';

// ─── Job state in Redis ───────────────────────────────────────────────────────
// Polled by the UI to render a progress bar. TTL'd so old jobs roll off.

export type ImportStatus = 'running' | 'complete' | 'failed';

export interface ImportJobState {
  status: ImportStatus;
  userId: string;
  startedAt: string;
  completedAt?: string;
  // Cumulative counters — incremented as the parser streams.
  totalEntries: number;
  inserted: number;
  filteredPodcast: number;
  filteredAudiobook: number;
  filteredIncomplete: number;
  filteredTooShort: number;
  errorMessage?: string;
}

const JOB_TTL_SECONDS = 24 * 60 * 60;

export async function getImportJob(jobId: string): Promise<ImportJobState | null> {
  const raw = await redis.get(importKey(jobId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImportJobState;
  } catch {
    return null;
  }
}

async function writeJob(jobId: string, state: ImportJobState): Promise<void> {
  await redis
    .set(importKey(jobId), JSON.stringify(state), 'EX', JOB_TTL_SECONDS)
    .catch((err) => logger.warn({ jobId, err: String(err) }, 'import: writeJob failed'));
}

function importKey(jobId: string): string {
  return `import:${jobId}`;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Streams a Spotify Extended History ZIP into the user's listening_events
 * + tracks tables. Designed to be invoked fire-and-forget so the upload
 * endpoint can return a jobId immediately.
 *
 * Idempotent across re-uploads of the same export — the unique index on
 * (userId, trackId, playedAt) silently dedupes.
 */
export async function runImport(
  jobId: string,
  userId: string,
  zipBuffer: Buffer
): Promise<void> {
  const start: ImportJobState = {
    status: 'running',
    userId,
    startedAt: new Date().toISOString(),
    totalEntries: 0,
    inserted: 0,
    filteredPodcast: 0,
    filteredAudiobook: 0,
    filteredIncomplete: 0,
    filteredTooShort: 0,
  };
  await writeJob(jobId, start);

  let inserted = 0;

  try {
    const finalStats = await parseSpotifyHistoryZip(zipBuffer, {
      batchSize: 1000,
      progressEveryN: 5000,
      onBatch: async (events) => {
        inserted += await persistBatch(userId, events);
      },
      onProgress: async (stats) => {
        await writeJob(jobId, mergeStats(start, stats, inserted));
      },
    });

    const final: ImportJobState = {
      ...mergeStats(start, finalStats, inserted),
      status: 'complete',
      completedAt: new Date().toISOString(),
    };
    await writeJob(jobId, final);

    // Invalidate stats cache so the dashboard reflects the new history.
    await invalidatePrefix(`stats:${userId}:`);

    logger.info(
      {
        jobId,
        userId,
        inserted,
        totalEntries: finalStats.totalEntries,
        durationMs: Date.now() - new Date(start.startedAt).getTime(),
      },
      'Import complete'
    );
  } catch (err) {
    logger.error({ jobId, userId, err: String(err) }, 'Import failed');
    await writeJob(jobId, {
      ...start,
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage: String(err),
    });
  }
}

function mergeStats(base: ImportJobState, stats: ParseStats, inserted: number): ImportJobState {
  return {
    ...base,
    totalEntries: stats.totalEntries,
    inserted,
    filteredPodcast: stats.filteredOut.podcast,
    filteredAudiobook: stats.filteredOut.audiobook,
    filteredIncomplete: stats.filteredOut.incomplete,
    filteredTooShort: stats.filteredOut.tooShort,
  };
}

// ─── Batch persistence ────────────────────────────────────────────────────────

async function persistBatch(
  userId: string,
  events: ParsedHistoryEvent[]
): Promise<number> {
  // Deduplicate Track upserts within the batch — same trackId may appear
  // many times (re-listens), and we only need to write its metadata once.
  const trackById = new Map<
    string,
    { id: string; name: string; artistName: string; albumName: string }
  >();
  for (const e of events) {
    if (!trackById.has(e.trackId)) {
      trackById.set(e.trackId, {
        id: e.trackId,
        name: e.trackName,
        artistName: e.artistName,
        albumName: e.albumName,
      });
    }
  }

  // Upsert tracks first so the LEFT JOIN in dashboard queries finds them.
  // Don't overwrite existing rows that might already have richer data
  // (artistIds, albumId, imageUrl) from a recently-played sync.
  await db.track.createMany({
    data: Array.from(trackById.values()).map((t) => ({
      id: t.id,
      name: t.name,
      artistNames: [t.artistName],
      artistIds: [], // ZIP doesn't include artist IDs; track-backfill fills these
      albumName: t.albumName || null,
      durationMs: null,
    })),
    skipDuplicates: true,
  });

  // Insert events; dedupe handled by unique index (userId, trackId, playedAt)
  const result = await db.listeningEvent.createMany({
    data: events.map((e) => ({
      userId,
      trackId: e.trackId,
      playedAt: e.playedAt,
      msPlayed: e.msPlayed,
      source: 'extended_history',
    })),
    skipDuplicates: true,
  });

  return result.count;
}
