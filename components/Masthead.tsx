// SoundSage — Masthead (sticky header)
// Includes: almanac strip, logo + hanko seal, now-playing, connection pill,
// settings, tab nav, and time-range picker.
//
// Responsive behaviour is driven by the `.masthead-*` classes defined in
// globals.css — the inline styles set the maximalist desktop layout, and
// CSS media queries strip pieces away as the viewport narrows.

'use client';

import { Suspense, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Mono, pad2 } from './primitives';
import { ConnectionPill } from './ConnectionPill';
import { NowPlaying } from './NowPlaying';
import { SettingsButton } from './SettingsButton';
import { OnboardingModal } from './OnboardingModal';
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
      <div className="masthead-almanac-bar" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 28px',
        borderBottom: '1px solid var(--rule)',
        fontFamily: 'var(--font-mono)', fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        <span className="masthead-almanac-vol">Vol. III · No. 17 · Spring</span>
        <span className="masthead-almanac-tagline">聴 · A Listening Almanac · 録</span>
        <span>{today}</span>
      </div>

      {/* Logo + now-playing + connection pill, all on one row */}
      <div className="masthead-row" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 28px 18px', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
          {/* Hanko seal mark — 聴 = "to listen" */}
          <div className="masthead-hanko" style={{
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
              <span className="masthead-logo-name" style={{
                fontFamily: 'var(--font-mincho)',
                fontWeight: 600, fontSize: 40,
                letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--ink)',
              }}>SoundSage</span>
              <span className="masthead-logo-kanji" style={{
                fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 13,
                color: 'var(--seal)', letterSpacing: '0.5em',
              }}>音盤録</span>
            </div>
            <span className="masthead-tagline" style={{
              color: 'var(--muted)', fontFamily: 'var(--font-mincho)',
              fontStyle: 'italic', fontSize: 14, fontWeight: 400,
            }}>
              a record of the things you have been hearing
            </span>
          </div>
        </div>

        {/* Now-playing widget — fills the middle when active, collapses
            to nothing when idle so the row stays clean. Hidden below the
            tablet breakpoint so the masthead doesn't crowd. The wrapper
            centres the widget horizontally so its 506px-max card sits in
            the middle of the available space rather than hugging the
            logo on the left. */}
        <div
          className="masthead-now-playing"
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <NowPlaying />
        </div>

        {/* Fixed-width right column so NowPlaying never shifts as the
            ConnectionPill cycles through its loading states. */}
        <div
          className="masthead-right-rail"
          style={{
            flexShrink: 0,
            minWidth: 290,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <ConnectionPill />
          <SettingsButton />
        </div>
      </div>

      {/* First-login data-source picker — auto-opens when the user has Spotify
          connected but hasn't yet chosen ESH / Last.FM / Synthetic. Also
          re-openable from the Settings popover. */}
      <OnboardingModal />

      {/* Tab nav + time-range picker */}
      <div className="masthead-nav-row" style={{
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--rule)', padding: '0 16px',
      }}>
        <div className="masthead-tabs" style={{ display: 'flex', minWidth: 0, overflowX: 'auto' }}>
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
                whiteSpace: 'nowrap',
              }}
            >
              <Mono className="masthead-tab-num" style={{ fontSize: 9, opacity: 0.6 }}>{pad2(i + 1)}</Mono>
              {n.label}
            </Link>
          ))}
        </div>

        <div className="masthead-nav-spacer" style={{ flex: 1 }} />
        {/* `display: flex` so the picker inside stretches to the nav row's
            full height — without it the wrapper is a block and the buttons
            collapse to text-line height inside a taller bar. */}
        <div className="masthead-time-picker" style={{ display: 'flex' }}>
          {/* Suspense satisfies Next's static-analysis check for the
              useSearchParams() call inside TimeRangePicker. The fallback
              is invisible — the picker renders inert until the URL
              params hydrate, which happens on the same tick. */}
          <Suspense fallback={<div />}>
            <TimeRangePicker />
          </Suspense>
        </div>
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
  const onRangeRoute = pathname === '/'
                    || pathname === '/patterns'
                    || pathname === '/tracks'
                    || pathname === '/artists';
  const inert        = !onRangeRoute || searchParams.has('view');

  function setRange(r: TimeRange) {
    if (inert) return;
    const p = new URLSearchParams(searchParams.toString());
    p.set('range', r);
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
