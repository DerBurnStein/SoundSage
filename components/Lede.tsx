// SoundSage — Lede
// Editorial hero block at the top of the Overview tab. One huge display
// number framed by an eyebrow caption + serif subtitle. Pure presentation.

import { Caps, Display, Mono, fmtMins } from './primitives';

interface LedeProps {
  /** "PLAYS" / "MINUTES" / etc */
  eyebrow: string;
  /** The big number itself, already formatted */
  value: string;
  /** Sub-line under the value, set in serif */
  subtitle: React.ReactNode;
  /** Right-rail readout — small mono text */
  readout?: string;
  loading?: boolean;
}

export function Lede({ eyebrow, value, subtitle, readout, loading }: LedeProps) {
  if (loading) return <LedeSkeleton />;

  return (
    <section
      style={{
        padding: '40px 28px 48px',
        borderBottom: '1px solid var(--rule)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'end',
        gap: 24,
      }}
    >
      <div>
        <Caps>{eyebrow}</Caps>
        <Display
          size={108}
          weight={500}
          style={{ display: 'block', marginTop: 12, color: 'var(--ink)' }}
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
            // Force a single line so the section height stays constant across
            // every time-range tab. Long subtitles get ellipsis on narrow
            // viewports rather than wrapping to two lines.
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </p>
      </div>
      {readout && (
        <Mono style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '0.1em' }}>
          {readout}
        </Mono>
      )}
    </section>
  );
}

/**
 * Convenience formatter: takes a count + total minutes and returns an
 * Overview-appropriate Lede. Centralizes the "X plays / Y mins" text.
 *
 * Subtitle is intentionally compact so it always fits on one line at any
 * reasonable viewport width, keeping the section height stable across
 * every time-range tab.
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

function LedeSkeleton() {
  return (
    <section
      style={{
        padding: '40px 28px 48px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ height: 14, width: 80, background: 'var(--paper-2)', marginBottom: 18 }} />
      <div style={{ height: 96, width: 280, background: 'var(--paper-2)', marginBottom: 16 }} />
      <div style={{ height: 18, width: 360, background: 'var(--paper-2)' }} />
    </section>
  );
}
