import { redis } from './redis';
import logger from './logger';

const PREFIX = 'cache:';

/**
 * Read a JSON value from Redis. Returns null on miss or any parse/IO error.
 * Errors are swallowed — cache is best-effort.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ key, err: String(err) }, 'cache get failed');
    return null;
  }
}

/**
 * Write a JSON value with TTL. Errors are swallowed.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ key, err: String(err) }, 'cache set failed');
  }
}

/**
 * Delete every key matching `${PREFIX}${prefix}*`. Used on user mutations
 * (sync completion, account delete) to drop now-stale aggregates.
 *
 * Uses SCAN to avoid blocking Redis on a KEYS lookup at scale.
 */
export async function invalidatePrefix(prefix: string): Promise<number> {
  const match = `${PREFIX}${prefix}*`;
  let cursor = '0';
  let removed = 0;
  try {
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
      cursor = next;
      if (batch.length > 0) {
        removed += await redis.del(...batch);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ prefix, err: String(err) }, 'cache invalidatePrefix failed');
  }
  return removed;
}

/**
 * Helper: try cache, else compute + populate. TTL is required so callers
 * have to think about staleness — no silent infinite caching.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await compute();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
