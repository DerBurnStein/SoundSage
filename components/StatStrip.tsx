// SoundSage — StatStrip
// Horizontal row of 4-6 KPI tiles. Each tile: caption (Caps), big number
// (Display), and a small mono footer line. Pure presentation.

import { Caps, Display, Mono } from './primitives';

export interface StatTile {
  /** Short caption above the number (e.g. "UNIQUE TRACKS") */
  label: string;
  /** Display value. Accepts a pre-formatted string or any React node
   *  (e.g. a `<TweenNumber>` so the digits roll on range changes). */
  value: React.ReactNode;
  /** Optional small footnote rendered in mono below. Also accepts a node
   *  so footnote counts can animate too. */
  footnote?: React.ReactNode;
  /** Optional accent color for the value (defaults to var(--ink)) */
  accent?: 'ink' | 'ember' | 'seal' | 'moss';
}

interface StatStripProps {
  tiles: StatTile[];
  loading?: boolean;
}

const ACCENT: Record<NonNullable<StatTile['accent']>, string> = {
  ink: 'var(--ink)',
  ember: 'var(--ember)',
  seal: 'var(--seal)',
  moss: 'var(--moss)',
};

export function StatStrip({ tiles, loading }: StatStripProps) {
  if (loading) return <StatStripSkeleton count={tiles.length || 4} />;

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, 1fr)`,
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {tiles.map((t, i) => (
        <div
          key={t.label}
          style={{
            padding: '24px 24px 26px',
            borderRight: i < tiles.length - 1 ? '1px solid var(--rule)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Caps>{t.label}</Caps>
          <Display
            size={42}
            weight={500}
            style={{
              display: 'block',
              color: ACCENT[t.accent ?? 'ink'],
              lineHeight: 1,
            }}
          >
            {t.value}
          </Display>
          {t.footnote && (
            <Mono
              style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.05em' }}
            >
              {t.footnote}
            </Mono>
          )}
        </div>
      ))}
    </section>
  );
}

function StatStripSkeleton({ count }: { count: number }) {
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${count}, 1fr)`,
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '24px 24px 26px',
            borderRight: i < count - 1 ? '1px solid var(--rule)' : 'none',
          }}
        >
          <div style={{ height: 12, width: 80, background: 'var(--paper-2)', marginBottom: 12 }} />
          <div style={{ height: 38, width: 120, background: 'var(--paper-2)', marginBottom: 10 }} />
          <div style={{ height: 10, width: 60, background: 'var(--paper-2)' }} />
        </div>
      ))}
    </section>
  );
}
