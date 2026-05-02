import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const INGESTION_QUEUE_NAME = 'soundsage-ingestion';

export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection });

export async function enqueueIngestion(userId, reason = 'manual') {
  return ingestionQueue.add('sync-user', { userId, reason }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  });
}

export { connection as redisConnection };
