// SoundSage — primitive UI components
// These are the atomic building blocks used throughout the dashboard.
// No data fetching — purely presentational.

import React from 'react';

// ─────────────────────────────────────────────────────
// Rule — horizontal divider
// ─────────────────────────────────────────────────────
interface RuleProps {
  thick?:  boolean;
  dashed?: boolean;
  className?: string;
}
export function Rule({ thick = false, dashed = false, className }: RuleProps) {
  return (
    <div
      className={className}
      style={{
        height: thick ? 2 : 1,
        width: '100%',
        background: dashed ? 'transparent' : 'var(--rule)',
        backgroundImage: dashed
          ? 'repeating-linear-gradient(90deg, var(--rule) 0 4px, transparent 4px 8px)'
          : 'none',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────
// Caps — uppercase label with vertical rule kicker
// ─────────────────────────────────────────────────────
interface CapsProps {
  children: React.ReactNode;
  className?: string;
}
export function Caps({ children, className }: CapsProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--seal)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Vertical rule kicker — East Asian editorial motif */}
      <span aria-hidden="true" style={{ width: 2, height: 11, background: 'var(--seal)', display: 'inline-block' }} />
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Mono — tabular-numeral monospace span
// ─────────────────────────────────────────────────────
interface MonoProps {
  children: React.ReactNode;
  style?:   React.CSSProperties;
  className?: string;
}
export function Mono({ children, style, className }: MonoProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Display — editorial serif headline (Noto Serif JP / Shippori Mincho)
// ─────────────────────────────────────────────────────
interface DisplayProps {
  children:   React.ReactNode;
  size?:      number | string;
  weight?:    number;
  italic?:    boolean;
  style?:     React.CSSProperties;
  className?: string;
}
export function Display({
  children,
  size   = 64,
  weight = 500,
  italic = false,
  style,
  className,
}: DisplayProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: italic ? 'var(--font-mincho)' : 'var(--font-serif)',
        fontSize:   size,
        fontWeight: weight,
        fontStyle:  italic ? 'italic' : 'normal',
        letterSpacing: '-0.02em',
        lineHeight: 0.95,
        color: 'var(--ink)',
        display: 'inline-block',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function fmtMins(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h === 0 ? `${min}m` : `${h}h ${min.toString().padStart(2, '0')}m`;
}

export function fmtMs(ms: number): string {
  return fmtMins(Math.round(ms / 60_000));
}

export function hourLabel(h: number): string {
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
