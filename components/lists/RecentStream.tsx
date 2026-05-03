// SoundSage — RecentStream
// Chronological timeline of recently played tracks. Two modes:
//
//   • Static  (default): renders the `events` prop as-is. Used for
//     history subviews like /history?view=yesterday where the time
//     window is fixed and live updates would mix in unrelated events.
//   • Live    (`live` prop): seeds with the SSR'd `events`, then
//     subscribes to /api/history/recent via React Query and merges in
//     any newer events. New entries slide down from beyond the top
//     edge using a FLIP animation; older entries shift down to make
//     room. The top of the list is clipped so the new track *appears
//     to come from underneath the heading*, which is the editorial
//     read the user asked for.
//
// Live mode also re-fetches when the SettingsButton's "Re-sync now"
// finishes — it calls `queryClient.invalidateQueries(['recent-history'])`
// so this component picks up the new tracks within a frame.

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Caps, cleanTrackName } from '../primitives';
import { useTheme } from '../ThemeProvider';
import type { RecentEvent, RecentHistoryResponse } from '../../types';

interface RecentStreamProps {
  events:   RecentEvent[];
  loading?: boolean;
  /** When true, polls /api/history/recent and animates new arrivals in. */
  live?:    boolean;
}

const ENTER_OFFSET   = 40;   // px the new row starts above its slot
const FLIP_DURATION  = 520;  // ms — sliding down + new row dropping in
const ENTER_EASING   = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function RecentStream({ events, loading, live }: RecentStreamProps) {
  if (loading || (!events.length && !live)) {
    return (
      <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: 40, background: 'var(--paper-2)', marginBottom: 8, opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }

  return live ? (
    <LiveRecentStream initial={events} />
  ) : (
    <RecentStreamShell events={events} />
  );
}

// ─── Live wrapper ────────────────────────────────────────────────────────────

function LiveRecentStream({ initial }: { initial: RecentEvent[] }) {
  const { status } = useSession();
  const { reduceMotion } = useTheme();
  const [merged, setMerged] = useState<RecentEvent[]>(initial);
  const seenIdsRef = useRef<Set<string>>(new Set(initial.map((e) => e.id)));
  const cap = Math.max(initial.length, 12);

  // Polling: every 30s while focused, plus refetch on focus. The query
  // key matches the one SettingsButton invalidates after a manual sync,
  // so a successful re-sync triggers an immediate refetch here.
  const { data: live } = useQuery<RecentHistoryResponse>({
    queryKey: ['recent-history'],
    queryFn: async () => {
      const r = await fetch(`/api/history/recent?limit=${cap}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('recent fetch failed');
      return (await r.json()) as RecentHistoryResponse;
    },
    enabled: status === 'authenticated',
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  // Merge any newer-than-current events into the front of the list. We
  // only prepend events whose `playedAt` is strictly newer than the
  // current top — this keeps things ordered and idempotent across polls
  // even if the API's most recent page overlaps with what's on screen.
  useEffect(() => {
    if (!live?.events?.length) return;
    setMerged((prev) => {
      const topAt = prev[0]?.playedAt ?? '';
      const incoming = live.events
        .filter((e) => !seenIdsRef.current.has(e.id) && e.playedAt > topAt);
      if (incoming.length === 0) return prev;
      // API returns DESC; preserving that order at the head of the list.
      for (const e of incoming) seenIdsRef.current.add(e.id);
      return [...incoming, ...prev].slice(0, cap);
    });
  }, [live, cap]);

  return (
    <RecentStreamShell
      events={merged}
      animateInsert={!reduceMotion}
    />
  );
}

// ─── Presentational shell + FLIP ─────────────────────────────────────────────

interface ShellProps {
  events:         RecentEvent[];
  animateInsert?: boolean;
}

function RecentStreamShell({ events, animateInsert }: ShellProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Map<event.id, top-px-relative-to-list>. Captures each row's previous
  // y position so we can apply a FLIP transform when the next render
  // shifts them down.
  const prevPositionsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    if (!animateInsert) {
      // Still record positions so a later toggle to animateInsert=true
      // has a baseline to FLIP from.
      const list = listRef.current;
      if (!list) return;
      const positions = new Map<string, number>();
      for (const child of Array.from(list.children) as HTMLElement[]) {
        const id = child.dataset.eventId;
        if (id) positions.set(id, child.offsetTop);
      }
      prevPositionsRef.current = positions;
      return;
    }

    const list = listRef.current;
    if (!list) return;
    const newPositions = new Map<string, number>();

    for (const child of Array.from(list.children) as HTMLElement[]) {
      const id = child.dataset.eventId;
      if (!id) continue;
      const top = child.offsetTop;
      newPositions.set(id, top);

      const prev = prevPositionsRef.current.get(id);
      if (prev !== undefined) {
        // Existing row — FLIP from where it used to be.
        const delta = prev - top;
        if (delta !== 0) {
          child.style.transition = 'none';
          child.style.transform = `translateY(${delta}px)`;
          // Force a reflow before un-setting so the browser commits the
          // "from" frame.
          void child.getBoundingClientRect();
          child.style.transition = `transform ${FLIP_DURATION}ms ${ENTER_EASING}`;
          child.style.transform = '';
        }
      } else {
        // Fresh row — slide down from above its slot, fading in. Sits
        // behind the heading because the surrounding list has overflow
        // hidden (set in shell styles below).
        child.style.transition = 'none';
        child.style.transform = `translateY(${-(ENTER_OFFSET)}px)`;
        child.style.opacity = '0';
        void child.getBoundingClientRect();
        child.style.transition =
          `transform ${FLIP_DURATION}ms ${ENTER_EASING}, ` +
          `opacity ${FLIP_DURATION}ms ${ENTER_EASING}`;
        child.style.transform = '';
        child.style.opacity = '1';
      }
    }

    prevPositionsRef.current = newPositions;
  }, [events, animateInsert]);

  return (
    <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ marginBottom: 16 }}>
        <Caps>Stream — recently played</Caps>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          The last <em>moments</em>
        </h3>
      </div>

      <div
        ref={listRef}
        style={{
          position: 'relative',
          // The clip is what makes new rows feel like they're emerging
          // from beneath the heading: their translateY(-ENTER_OFFSET)
          // start position lives above this box and isn't visible until
          // the FLIP transform settles back to 0.
          overflow: animateInsert ? 'hidden' : 'visible',
          paddingTop: animateInsert ? 4 : 0,
        }}
      >
        {/* Timeline rail */}
        <div style={{
          position: 'absolute', left: 11, top: 6, bottom: 6, width: 1,
          backgroundImage: 'repeating-linear-gradient(to bottom, var(--rule) 0 3px, transparent 3px 6px)',
          pointerEvents: 'none',
        }} />

        {events.map((ev, i) => (
          <div
            key={ev.id}
            data-event-id={ev.id}
            style={{
              display: 'grid', gridTemplateColumns: '24px 1fr auto',
              alignItems: 'center', gap: 12, padding: '8px 0',
              willChange: animateInsert ? 'transform, opacity' : undefined,
            }}
          >
            <div style={{
              width: 9, height: 9, marginLeft: 7,
              background: i === 0 ? 'var(--ember)' : 'var(--ink)',
              borderRadius: '50%', position: 'relative', zIndex: 1,
              boxShadow: '0 0 0 3px var(--paper)',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 500,
                color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{cleanTrackName(ev.track.name)}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--muted)' }}>
                <em style={{ fontFamily: 'var(--font-mincho)', fontSize: 12 }}>
                  {ev.track.artists.map((a) => a.name).join(', ')}
                </em>
              </div>
            </div>
            <RelTime iso={ev.playedAt} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Relative-time label that's safe for SSR. Server (and the first client
 * render) emit an empty span, then `useEffect` fills it in on mount and
 * refreshes every 30s. Without this both server-rendered "32m ago" and
 * client-hydrated "33m ago" would race the clock and trip the React
 * hydration mismatch warning.
 */
function RelTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    const compute = () => {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60_000);
      if (mins < 1)   return 'just now';
      if (mins < 60)  return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24)   return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    };
    setText(compute());
    const id = setInterval(() => setText(compute()), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <span
      suppressHydrationWarning
      style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 10,
        color: 'var(--dim)',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}
