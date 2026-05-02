import { Worker, QueueEvents, Queue } from 'bullmq';
import { prisma } from './prisma.js';
import { redisConnection, INGESTION_QUEUE_NAME, enqueueIngestion } from './queue.js';
import { repository } from './repository.js';
import { fetchRecentlyPlayed, normalizeRecentlyPlayedItem } from './spotifyClient.js';
import { refreshAccessToken } from './spotifyAuth.js';
import { sendAlert } from './alerts.js';
import { logEvent, reportError } from './monitoring.js';

const deadLetterQueue = new Queue(`${INGESTION_QUEUE_NAME}-dlq`, { connection: redisConnection });
const queueEvents = new QueueEvents(INGESTION_QUEUE_NAME, { connection: redisConnection });

async function ensureValidAccessToken(userId) {
  const tokens = await repository.getSpotifyTokens(userId);
  if (!tokens?.refreshToken) throw new Error('No refresh token');

  const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : 0;
  if (Date.now() + 60_000 < expiresAt && tokens.accessToken) return tokens.accessToken;

  const refreshed = await refreshAccessToken({
    refreshToken: tokens.refreshToken,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const account = await repository.getAccount(userId);
  await repository.saveSpotifyTokens(userId, {
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refreshToken,
  }, { valid: Boolean(account?.scopeValid), got: account?.grantedScopes || [], missing: account?.scopeMissing || [] });

  const newTokens = await repository.getSpotifyTokens(userId);
  return newTokens.accessToken;
}

async function processSyncJob(job) {
  const { userId } = job.data;
  const startedAt = Date.now();

  await repository.markIngestionRunStarted(userId, new Date(startedAt).toISOString());

  try {
    const accessToken = await ensureValidAccessToken(userId);
    const state = await repository.getIngestionState(userId);
    const afterMs = state?.highWatermarkPlayedAt ? new Date(state.highWatermarkPlayedAt).getTime() : undefined;

    const payload = await fetchRecentlyPlayed(accessToken, afterMs);
    const items = payload.items || [];

    const normalized = items.map(normalizeRecentlyPlayedItem);
    const result = await repository.ingestEvents(userId, normalized);

    const maxPlayedAt = normalized.reduce((max, e) => (new Date(e.playedAt) > new Date(max) ? e.playedAt : max), state?.highWatermarkPlayedAt || new Date(0).toISOString());

    await repository.markIngestionRunFinished(userId, {
      finishedAt: new Date().toISOString(),
      highWatermarkPlayedAt: maxPlayedAt,
      status: 'idle',
      lastError: null,
      latencyMs: Date.now() - startedAt,
      insertedCount: result.inserted,
      receivedCount: result.received,
    });

    return result;
  } catch (err) {
    await reportError(err, { userId, stage: 'ingestion_worker' });
    await sendAlert('ingestion_run_failed', { userId, error: String(err) });
    await repository.markIngestionRunFailed(userId, {
      failedAt: new Date().toISOString(),
      error: String(err),
      latencyMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export function startWorker() {
  const worker = new Worker(INGESTION_QUEUE_NAME, processSyncJob, { connection: redisConnection, concurrency: 4 });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      await deadLetterQueue.add('dead-sync-user', {
        originalJobId: job.id,
        payload: job.data,
        error: String(err),
        failedAt: new Date().toISOString(),
      });
    }
  });

  return worker;
}

export async function scheduleRecurringSync() {
  await enqueueIngestion('bootstrap', 'warmup');
  await prisma.$executeRawUnsafe('SELECT 1');
}

queueEvents.on('completed', ({ jobId }) => logEvent('info', 'sync_completed', { jobId }));
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  logEvent('error', 'sync_failed', { jobId, failedReason });
  await sendAlert('sync_failed', { jobId, failedReason });
});

if (process.argv[1]?.includes('worker.js')) {
  startWorker();
  console.log('Ingestion worker started.');
}
