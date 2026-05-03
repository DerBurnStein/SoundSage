// Unit tests for lib/history-window.ts — the date math powering the
// History destination views (today / yesterday / this-week / last-week).
// `historyWindow` accepts an injectable `now`, so we can pin the clock to
// known instants in any timezone and assert the resulting [from, to)
// boundaries fall on local-midnight in the user's tz.

import { describe, it, expect } from 'vitest';
import {
  historyWindow,
  wallClockToUTC,
  tzOffsetMs,
  type HistoryView,
} from '@/lib/history-window';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// wallClockToUTC / tzOffsetMs
// ────────────────────────────────────────────────────────────────────────────

describe('wallClockToUTC', () => {
  it('returns the same instant for UTC tz', () => {
    const got = wallClockToUTC(2026, 5, 3, 0, 'UTC');
    expect(got.toISOString()).toBe('2026-05-03T00:00:00.000Z');
  });

  it('offsets back by 7h for America/Los_Angeles in PDT (May)', () => {
    // Midnight on May 3 2026 in LA (PDT, UTC-7) = 07:00 UTC same day.
    const got = wallClockToUTC(2026, 5, 3, 0, 'America/Los_Angeles');
    expect(got.toISOString()).toBe('2026-05-03T07:00:00.000Z');
  });

  it('offsets forward by 9h for Asia/Tokyo (JST, UTC+9)', () => {
    // Midnight May 3 2026 in Tokyo = 15:00 UTC May 2 2026.
    const got = wallClockToUTC(2026, 5, 3, 0, 'Asia/Tokyo');
    expect(got.toISOString()).toBe('2026-05-02T15:00:00.000Z');
  });
});

describe('tzOffsetMs', () => {
  it('reports zero for UTC', () => {
    expect(tzOffsetMs(Date.UTC(2026, 4, 3), 'UTC')).toBe(0);
  });

  it('reports +9h east of UTC for Tokyo', () => {
    // 9 * 60 * 60 * 1000 = 32400000
    expect(tzOffsetMs(Date.UTC(2026, 4, 3), 'Asia/Tokyo')).toBe(9 * 60 * 60 * 1000);
  });

  it('reports -7h west of UTC for LA in May (DST)', () => {
    expect(tzOffsetMs(Date.UTC(2026, 4, 3), 'America/Los_Angeles')).toBe(-7 * 60 * 60 * 1000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// historyWindow — timezone correctness
// ────────────────────────────────────────────────────────────────────────────

describe('historyWindow', () => {
  // Pin "now" to Sunday 2026-05-03 12:00 UTC. In LA (PDT, UTC-7) that's
  // Sunday 05:00 local. In Tokyo (UTC+9) that's Sunday 21:00 local. In
  // UTC tz it's also Sunday 12:00. Local "today" should resolve to
  // 2026-05-03 in all three.
  const NOW = new Date('2026-05-03T12:00:00.000Z');

  it("today's window starts at local midnight and ends at next midnight", () => {
    const w = historyWindow('today', 'UTC', NOW);
    expect(w.from.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-05-04T00:00:00.000Z');
    expect(w.label).toBe('Today');
  });

  it('yesterday is exactly 24 hours, ending at today-start', () => {
    const w = historyWindow('yesterday', 'UTC', NOW);
    expect(w.from.toISOString()).toBe('2026-05-02T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    expect(w.to.getTime() - w.from.getTime()).toBe(ONE_DAY_MS);
    expect(w.label).toBe('Yesterday');
  });

  it("this-week starts on Monday and includes today", () => {
    // 2026-05-03 is a Sunday. The Monday-anchored week containing Sunday
    // starts on 2026-04-27 (Monday) and includes Sunday's tomorrow as
    // the exclusive upper bound.
    const w = historyWindow('this-week', 'UTC', NOW);
    expect(w.from.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-05-04T00:00:00.000Z');
    expect(w.label).toBe('This week');
  });

  it("last-week is the prior Monday-Sunday block, exclusive of this week", () => {
    const w = historyWindow('last-week', 'UTC', NOW);
    expect(w.from.toISOString()).toBe('2026-04-20T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    // Exactly 7 days
    expect(w.to.getTime() - w.from.getTime()).toBe(7 * ONE_DAY_MS);
    expect(w.label).toBe('Last week');
  });

  it("LA's local-midnight today is 07:00 UTC (PDT offset)", () => {
    // At NOW=2026-05-03T12:00Z, LA local time is 05:00 the same day.
    // So today-in-LA starts at 2026-05-03T07:00:00.000Z (midnight PDT).
    const w = historyWindow('today', 'America/Los_Angeles', NOW);
    expect(w.from.toISOString()).toBe('2026-05-03T07:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-05-04T07:00:00.000Z');
  });

  it("Tokyo's local-midnight today is the previous day at 15:00 UTC", () => {
    // At NOW=2026-05-03T12:00Z, Tokyo local time is 21:00 the same day.
    // So today-in-Tokyo started at 2026-05-03T00:00 JST = 2026-05-02T15:00Z.
    const w = historyWindow('today', 'Asia/Tokyo', NOW);
    expect(w.from.toISOString()).toBe('2026-05-02T15:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-05-03T15:00:00.000Z');
  });

  it("yesterday + today + tomorrow tile contiguously", () => {
    const yest  = historyWindow('yesterday', 'UTC', NOW);
    const today = historyWindow('today',     'UTC', NOW);
    expect(yest.to.toISOString()).toBe(today.from.toISOString());
  });

  it("this-week starts on Monday for a mid-week 'now'", () => {
    // 2026-04-29 is a Wednesday.
    const wed = new Date('2026-04-29T12:00:00.000Z');
    const w = historyWindow('this-week', 'UTC', wed);
    expect(w.from.toISOString()).toBe('2026-04-27T00:00:00.000Z'); // Mon
    expect(w.to.toISOString()).toBe('2026-04-30T00:00:00.000Z');   // Wed end-of-day
  });

  it("this-week's Monday is the same as the day for a Monday 'now'", () => {
    // 2026-04-27 is a Monday.
    const mon = new Date('2026-04-27T12:00:00.000Z');
    const w = historyWindow('this-week', 'UTC', mon);
    expect(w.from.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-04-28T00:00:00.000Z');
  });

  it('produces the correct human label for every view', () => {
    const labels: Record<HistoryView, string> = {
      'today':      'Today',
      'yesterday':  'Yesterday',
      'this-week':  'This week',
      'last-week':  'Last week',
    };
    for (const view of Object.keys(labels) as HistoryView[]) {
      expect(historyWindow(view, 'UTC', NOW).label).toBe(labels[view]);
    }
  });
});
