import { db } from './db';

const VALID_TZ_CACHE = new Map<string, boolean>();

/**
 * Returns true if the IANA tz string is recognized by the runtime's Intl
 * implementation. Cached per-process.
 */
export function isValidTimezone(tz: string): boolean {
  const cached = VALID_TZ_CACHE.get(tz);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    VALID_TZ_CACHE.set(tz, true);
    return true;
  } catch {
    VALID_TZ_CACHE.set(tz, false);
    return false;
  }
}

/**
 * Returns the user's stored timezone, falling back to UTC.
 *
 * If the caller passes a `clientTz` (typically from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` on the browser) and the
 * stored value is the default 'UTC', we persist the upgrade. This is the
 * "lazy timezone capture" pattern called out in PHASES.md §4.1.
 */
export async function resolveUserTimezone(
  userId: string,
  clientTz?: string | null
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const stored = user?.timezone ?? 'UTC';

  if (
    clientTz &&
    isValidTimezone(clientTz) &&
    stored === 'UTC' &&
    clientTz !== 'UTC'
  ) {
    await db.user
      .update({ where: { id: userId }, data: { timezone: clientTz } })
      .catch(() => undefined);
    return clientTz;
  }

  return stored;
}
