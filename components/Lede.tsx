// SoundSage — Lede
// Editorial hero block at the top of the Overview tab. One huge display
// number on the left, plus an optional `aside` slot (e.g. a "highlights"
// panel) that flexes to fill the remaining width on wide screens.

import { Caps, Display, Mono, fmtMins } from './primitives';

interface LedeProps {
  /** "PLAYS" / "MINUTES" / etc */
  eyebrow: string;
  /** The big number itself. Accepts a pre-formatted string or any React
   *  node (e.g. a `<TweenNumber>` so the digits roll on range changes). */
  value: React.ReactNode;
  /** Sub-line under the value, set in serif */
  subtitle: React.ReactNode;
  /** Right-rail readout — small mono text. Rendered above `aside`. */
  readout?: string;
  /** Optional right-side content — fills the white space next to the
   *  giant number on wide screens. Hidden when not provided so the lede
   *  collapses back to its original eyebrow / number / subtitle stack. */
  aside?: React.ReactNode;
  loading?: boolean;
}

export function Lede({ eyebrow, value, subtitle, readout, aside, loading }: LedeProps) {
  if (loading) return <LedeSkeleton />;

  return (
    <section
      style={{
        padding: '40px 28px 48px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {/* Cap content to ~1380 like the other editorial bands so the lede
          doesn't sprawl across ultra-wide screens with empty middle space. */}
      <div
        style={{
          maxWidth: 1380,
          margin: '0 auto',
          display: 'grid',
          // Left column is locked at a stable minimum so the dividing rule
          // between number and aside doesn't slide as the play-count
          // value changes width across time-range tabs ("477" vs "5,115"
          // vs "30,002" all sit within the same 420px slot now). It still
          // expands for genuinely huge numbers via `minmax(_, auto)`.
          gridTemplateColumns: aside
            ? 'minmax(420px, auto) minmax(0, 1fr)'
            : '1fr auto',
          alignItems: 'end',
          gap: 64,
        }}
      >
        <div>
          <Caps>{eyebrow}</Caps>
          <Display
            size={108}
            weight={500}
            style={{ display: 'block', marginTop: 12, color: 'var(--accent)' }}
          >
            {value}
          </Display>
          <p
            style={{
              fontFamily: 'var(--font-mincho)',
              fontStyle: 'italic',
              fontSize: 18,
              color: 'var(--muted)',
              marginTop: 16,
              lineHeight: 1.45,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </p>
        </div>

        {aside ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'flex-end',
              gap: 18,
              minWidth: 0,
              // A subtle vertical rule visually anchors the aside to the
              // big number on the left, framing the editorial spread.
              borderLeft: '1px solid var(--rule)',
              paddingLeft: 32,
            }}
          >
            {readout && (
              <Mono
                style={{
                  fontSize: 11,
                  color: 'var(--dim)',
                  letterSpacing: '0.1em',
                  alignSelf: 'flex-end',
                }}
              >
                {readout}
              </Mono>
            )}
            <div style={{ width: '100%' }}>{aside}</div>
          </div>
        ) : (
          readout && (
            <Mono style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '0.1em' }}>
              {readout}
            </Mono>
          )
        )}
      </div>
    </section>
  );
}

/**
 * Convenience formatter: takes a count + total minutes and returns an
 * Overview-appropriate Lede. Centralizes the "X plays / Y mins" text.
 */
export function describeListening(totalPlays: number, totalMs: number): {
  value: string;
  subtitle: string;
} {
  const mins = Math.round(totalMs / 60_000);
  return {
    value: totalPlays.toLocaleString(),
    subtitle: `${fmtMins(mins)} of audio · ${totalPlays.toLocaleString()} plays`,
  };
}

// ─────────────────────────────────────────────────────
// LedeHighlights — multi-column "what stood out" panel
// Designed to be passed into Lede's `aside` slot.
// ─────────────────────────────────────────────────────

export interface LedeHighlight {
  /** Short editorial caption, e.g. "B — Top track" */
  kicker:   string;
  /** Primary label (track name, artist name, genre name). Accepts a node
   *  so numeric headlines can animate via `<TweenNumber>`. */
  name:     React.ReactNode;
  /** Optional secondary line in italic mincho */
  byline?:  string;
  /** Numeric stat. Accepts a pre-formatted string or any React node
   *  (e.g. a `<TweenNumber>` so the digits roll on range changes). */
  stat:     React.ReactNode;
  /** Optional visual progress bar 0..1 — used to give the panel a chart-like
   *  feel without needing a separate visualization component. */
  share?:   number;
  /** Optional accent color for the bar (defaults to var(--ink)) */
  color?:   string;
}

interface LedeHighlightsProps {
  items: LedeHighlight[];
}

export function LedeHighlights({ items }: LedeHighlightsProps) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: 24,
        borderTop: '1px solid var(--rule)',
        paddingTop: 20,
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 0,
            // Light vertical separator between columns to give the panel
            // some structure on wide screens.
            paddingLeft: i === 0 ? 0 : 18,
            borderLeft: i === 0 ? 'none' : '1px dotted var(--rule)',
          }}
        >
          <Caps>{it.kicker}</Caps>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 6,
            }}
          >
            {it.name}
          </div>
          {it.byline && (
            <div
              style={{
                fontFamily: 'var(--font-mincho)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {it.byline}
            </div>
          )}

          {/* Optional inline share bar */}
          {it.share != null && (
            <div
              style={{
                marginTop: 6,
                height: 2,
                background: 'var(--paper-3)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0, top: 0, bottom: 0,
                  width: `${Math.max(0, Math.min(1, it.share)) * 100}%`,
                  background: it.color ?? 'var(--ink)',
                  transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          )}

          <Mono
            style={{
              fontSize: 11,
              color: 'var(--dim)',
              letterSpacing: '0.06em',
              marginTop: it.share != null ? 6 : 4,
            }}
          >
            {it.stat}
          </Mono>
        </div>
      ))}
    </div>
  );
}

function LedeSkeleton() {
  return (
    <section
      style={{
        padding: '40px 28px 48px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <div style={{ height: 14, width: 80, background: 'var(--paper-2)', marginBottom: 18 }} />
        <div style={{ height: 96, width: 280, background: 'var(--paper-2)', marginBottom: 16 }} />
        <div style={{ height: 18, width: 360, background: 'var(--paper-2)' }} />
      </div>
    </section>
  );
}
