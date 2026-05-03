// Pure date-math helpers for the History destination views (today /
// yesterday / this-week / last-week). Lives in its own file so unit tests
// can import without dragging in lib/db.ts (Prisma) and the rest of the
// data layer.

export type HistoryView = 'today' | 'yesterday' | 'this-week' | 'last-week';

export interface HistoryWindow {
  from:  Date;
  to:    Date;
  label: string;
}

/**
 * Resolves a History view slug to a [from, to) date window in UTC. The
 * boundaries are evaluated in the user's local timezone — "today" means
 * today in their wall clock, not today in UTC. Weeks are Monday-anchored.
 *
 * `now` is injectable so tests can pin a deterministic clock; production
 * callers can omit it and get `new Date()`.
 */
export function historyWindow(
  view: HistoryView,
  tz: string,
  now: Date = new Date()
): HistoryWindow {
  // Compute "now in tz" by formatting via Intl, then re-parsing as a UTC
  // date. Good enough for day-boundary math without pulling in date-fns.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const localY = get('year'), localM = get('month'), localD = get('day');

  const todayLocalMidnightUTC = wallClockToUTC(localY, localM, localD, 0, tz);

  // Monday-anchored week start. JS getDay() returns 0=Sun..6=Sat; remap to
  // 0=Mon..6=Sun via (dow + 6) % 7.
  const dow = new Date(localY, localM - 1, localD).getDay();
  const sinceMon = (dow + 6) % 7;
  const weekStart = new Date(todayLocalMidnightUTC);
  weekStart.setUTCDate(weekStart.getUTCDate() - sinceMon);

  const tomorrow = new Date(todayLocalMidnightUTC);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const yesterday = new Date(todayLocalMidnightUTC);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

  switch (view) {
    case 'today':
      return { from: todayLocalMidnightUTC, to: tomorrow,             label: 'Today' };
    case 'yesterday':
      return { from: yesterday,             to: todayLocalMidnightUTC, label: 'Yesterday' };
    case 'this-week':
      return { from: weekStart,             to: tomorrow,             label: 'This week' };
    case 'last-week':
      return { from: lastWeekStart,         to: weekStart,             label: 'Last week' };
  }
}

/** Convert a local wall-clock (y,m,d,h) in tz to a UTC Date instant. */
export function wallClockToUTC(
  y: number, m: number, d: number, h: number, tz: string
): Date {
  // Construct as if it were UTC, then correct by the tz offset at that instant.
  const naive = Date.UTC(y, m - 1, d, h, 0, 0);
  const offset = tzOffsetMs(naive, tz);
  return new Date(naive - offset);
}

/** Returns (asUTC - utcMs) where asUTC is the wall-clock time in `tz`
 *  re-interpreted as if it were UTC. Equivalent to "minutes east of UTC"
 *  in milliseconds. */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return asUTC - utcMs;
}
