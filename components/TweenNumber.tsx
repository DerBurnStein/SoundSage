// SoundSage — TweenNumber
// Rolling-number display that smoothly counts from its previously-shown
// value to a new target whenever its `value` prop changes. Used for the
// big play counts on the Lede, the StatStrip tiles, and any other numeric
// readout that should animate when the time-range picker swaps datasets.
//
// The `format` prop is a *string key* (not a function) because this is a
// 'use client' component and Next.js can't serialise function props from
// a server component across the boundary. The format table below covers
// every Overview-page need; add new entries as more readouts come online.
//
// Each instance owns its own rAF loop, so multiple `TweenNumber`s on the
// page tween in parallel without coordination. Mid-flight changes pivot:
// if the user clicks a new range while an animation is still settling,
// the next tween starts from wherever the displayed value currently is.

'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtMins, fmtMs, hourLabel } from './primitives';
import { useTheme } from './ThemeProvider';

// Number-format aware integer string. With 'plain' the user opts out of
// thousands separators (1234 instead of 1,234) — matches the choice in
// Settings → Number format.
function intStr(n: number, grouped: boolean): string {
  return grouped
    ? Math.round(n).toLocaleString()
    : String(Math.round(n));
}

export type TweenFormat =
  | 'count'    // 1,234 — comma-grouped integer
  | 'percent'  // "42.5%" — share value (0..1) shown to one decimal
  | 'pctInt'   // "42%" — share value (0..1) shown as a whole percent
  | 'mins'     // value is a minute count → "2h 04m"
  | 'ms'       // value is in milliseconds → "2h 04m"
  | 'hour';    // value is 0..23 → "12AM" / "5PM"

function makeFormatters(grouped: boolean): Record<TweenFormat, (n: number) => string> {
  return {
    count:   (n) => intStr(n, grouped),
    percent: (n) => `${(n * 100).toFixed(1)}%`,
    pctInt:  (n) => `${Math.round(n * 100)}%`,
    mins:    (n) => fmtMins(Math.round(n)),
    ms:      (n) => fmtMs(Math.round(n)),
    hour:    (n) => hourLabel(Math.round(n)),
  };
}

interface TweenNumberProps {
  /** Target numeric value. Animations trigger when this reference value
   *  changes between renders. */
  value: number;
  /** Format key — see `TweenFormat` above. Default `'count'`. */
  format?: TweenFormat;
  /** Animation duration in ms. Default 600. */
  duration?: number;
  /** Optional className passed to the underlying span. */
  className?: string;
  style?: React.CSSProperties;
}

export function TweenNumber({
  value,
  format = 'count',
  duration = 600,
  className,
  style,
}: TweenNumberProps) {
  const { numberFormat, reduceMotion } = useTheme();
  const formatter = makeFormatters(numberFormat === 'grouped')[format];

  // Currently-displayed value. We carry it in both state (for rendering)
  // and a ref (for synchronous reads inside the next effect / rAF tick).
  const [displayed, setDisplayed] = useState<number>(value);
  const displayedRef = useRef<number>(value);

  const targetRef = useRef<number>(value);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);
  const firstRunRef = useRef(true);

  useEffect(() => {
    // First mount: just snap to the initial value, no animation.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      targetRef.current = value;
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }
    // Same target as last time — nothing to do.
    if (value === targetRef.current) return;

    // Reduce motion: snap straight to the new value, no rAF interpolation.
    if (reduceMotion) {
      targetRef.current = value;
      displayedRef.current = value;
      setDisplayed(value);
      return;
    }

    // Pivot: start from whatever's currently on screen (handles mid-flight
    // changes gracefully) and aim at the new target.
    fromRef.current = displayedRef.current;
    targetRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      // ease-out cubic — fast start, gentle settle, matches the rest
      // of the project's transitions.
      const eased = 1 - Math.pow(1 - t, 3);
      const interp = fromRef.current + (targetRef.current - fromRef.current) * eased;
      displayedRef.current = interp;
      setDisplayed(interp);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, reduceMotion]);

  return (
    <span
      className={className}
      // tabular-nums keeps glyph widths stable so the number doesn't
      // visibly jitter sideways as digits flip.
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {formatter(displayed)}
    </span>
  );
}
