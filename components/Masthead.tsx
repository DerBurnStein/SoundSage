// SoundSage — Masthead (sticky header)
// Includes: almanac strip, logo + hanko seal, connection pill, tab nav, time-range picker.
//
// In Next.js App Router, this lives inside a Client Component (nav state).
// The sticky header uses `position: sticky; top: 0; z-index: 50`.

'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Mono, pad2 } from './primitives';
import { ConnectionPill } from './ConnectionPill';
import { NowPlaying } from './NowPlaying';
import type { TabId, TimeRange } from '../types';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────
const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'history',   label: 'History'   },
  { id: 'patterns',  label: 'Patterns'  },
  { id: 'tracks',    label: 'Tracks'    },
  { id: 'artists',   label: 'Artists'   },
];

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: '4w',  label: '4 weeks'  },
  { id: '6m',  label: '6 months' },
  { id: '1y',  label: '1 year'   },
  { id: 'all', label: 'All time' },
];

// ─────────────────────────────────────────────────────
// Masthead
// ─────────────────────────────────────────────────────
interface MastheadProps {
  today: string;
}
export function Masthead({ today }: MastheadProps) {
  const pathname = usePathname();
  const activeTab = (pathname.replace('/', '') || 'overview') as TabId;

  return (
    <header style={{
      borderBottom: '1px solid var(--rule)',
      background: 'var(--paper)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* Almanac top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 28px',
        borderBottom: '1px solid var(--rule)',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        <span>Vol. III · No. 17 · Spring</span>
        <span>聴 · A Listening Almanac · 録</span>
        <span>{today}</span>
      </div>

      {/* Logo + now-playing + connection pill, all on one row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 28px 18px', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
          {/* Hanko seal mark — 聴 = "to listen" */}
          <div style={{
            width: 56, height: 56,
            background: 'var(--seal)', color: 'var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mincho)', fontWeight: 700, fontSize: 30,
            borderRadius: 4, transform: 'rotate(-3deg)',
            boxShadow: 'inset 0 0 0 2px var(--paper)',
            lineHeight: 1, flexShrink: 0,
          }}>聴</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{
                fontFamily: 'var(--font-mincho)',
                fontWeight: 600, fontSize: 40,
                letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--ink)',
              }}>SoundSage</span>
              <span style={{
                fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 13,
                color: 'var(--seal)', letterSpacing: '0.5em',
              }}>音盤録</span>
            </div>
            <span style={{
              color: 'var(--muted)', fontFamily: 'var(--font-mincho)',
              fontStyle: 'italic', fontSize: 14, fontWeight: 400,
            }}>
              a record of the things you have been hearing
            </span>
          </div>
        </div>

        {/* Now-playing widget — fills the middle when active, collapses
            to nothing when idle so the row stays clean. */}
        <NowPlaying />

        {/* Fixed-width right column so NowPlaying never shifts as the
            ConnectionPill cycles through its loading states. */}
        <div
          style={{
            flexShrink: 0,
            minWidth: 290,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <ConnectionPill />
        </div>
      </div>

      {/* Tab nav + time-range picker */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--rule)', padding: '0 16px',
      }}>
        {NAV_ITEMS.map((n, i) => (
          <Link
            key={n.id}
            href={n.id === 'overview' ? '/' : `/${n.id}`}
            style={{
              border: 'none', textDecoration: 'none',
              background: activeTab === n.id ? 'var(--ink)' : 'transparent',
              color:      activeTab === n.id ? 'var(--paper)' : 'var(--ink)',
              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
              letterSpacing: '0.04em',
              padding: '12px 18px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              borderRight: i < NAV_ITEMS.length - 1 ? '1px solid var(--rule)' : 'none',
            }}
          >
            <Mono style={{ fontSize: 9, opacity: 0.6 }}>{pad2(i + 1)}</Mono>
            {n.label}
          </Link>
        ))}

        <div style={{ flex: 1 }} />
        <TimeRangePicker />
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────
// TimeRangePicker
// Reads/writes `?range=` search param; parent pages consume it.
// ─────────────────────────────────────────────────────
function TimeRangePicker() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const [isPending, startTransition] = useTransition();
  const range        = (searchParams.get('range') ?? '4w') as TimeRange;
  // The picker drives data on Overview, Patterns, Tracks index, and Artists
  // index. It is inert on History (Recent Stream is always "latest") and on
  // any destination view (where the view's own slug encodes the time window).
  const onRangeRoute = pathname === '/'
                    || pathname === '/patterns'
                    || pathname === '/tracks'
                    || pathname === '/artists';
  const inert        = !onRangeRoute || searchParams.has('view');

  function setRange(r: TimeRange) {
    if (inert) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set('range', r);
    // Wrap in startTransition so Next.js keeps the current UI visible while
    // the new data fetches — instead of replacing the page with loading.tsx
    // skeletons. This keeps DOM nodes mounted across the navigation, so
    // CSS transitions on bar widths animate from old → new value smoothly
    // rather than from a fresh mount.
    startTransition(() => {
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderLeft: '1px solid var(--rule)',
        // Subtle visual signal that a range change is in flight. Doesn't
        // disable the buttons — clicking again during pending just queues
        // the next transition.
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 200ms ease',
      }}
      title={inert ? 'Time range does not apply here' : undefined}
    >
      {TIME_RANGES.map((r, i) => {
        const isActive = !inert && range === r.id;
        return (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            disabled={inert}
            aria-disabled={inert}
            style={{
              border: 'none',
              background: isActive ? 'var(--paper-3)' : 'transparent',
              color: inert ? 'var(--dim)' : isActive ? 'var(--ink)' : 'var(--muted)',
              fontFamily: 'var(--font-sans)', fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              padding: '0 14px',
              cursor: inert ? 'not-allowed' : 'pointer',
              opacity: inert ? 0.45 : 1,
              borderRight: i < TIME_RANGES.length - 1 ? '1px solid var(--rule)' : 'none',
              letterSpacing: '0.02em',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
