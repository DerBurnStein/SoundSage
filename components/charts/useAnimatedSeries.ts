// SoundSage — animated series hook
// Interpolates a numeric data series from its previous values to the current
// values over `durationMs` using requestAnimationFrame. Used by chart
// components whose visual is a path/shape derived from the data — CSS
// transitions can't animate SVG `d` attributes, so we interpolate the
// underlying numbers and let React re-render the path each frame.
//
// Usage:
//   const live = useAnimatedSeries(data, ['plays', 'mins']);
//   // `live` has the same shape as `data`, with the named numeric fields
//   // smoothly tweened. All other fields are taken from the latest `data`.

'use client';

import { useEffect, useRef, useState } from 'react';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useAnimatedSeries<T extends Record<string, unknown>>(
  data: T[],
  fields: (keyof T)[],
  durationMs = 600
): T[] {
  // Force re-render at each rAF tick.
  const [, force] = useState(0);

  // The values currently shown on screen. Updated each frame during animation.
  const currentRef = useRef<T[]>(data);
  // Snapshot of `currentRef` at the start of the in-flight animation.
  const fromRef = useRef<T[]>(data);
  // The target values we are animating toward.
  const targetRef = useRef<T[]>(data);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const firstRunRef = useRef(true);

  useEffect(() => {
    // First mount: show the data immediately, no animation.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      currentRef.current = data;
      targetRef.current = data;
      return;
    }
    // Same reference — nothing to animate.
    if (data === targetRef.current) return;

    // Snapshot the current displayed values to interpolate from. This works
    // mid-animation too: if the user clicks a new range while a previous
    // animation is still running, the new tween starts from wherever the
    // bars currently are visually, not from the original "from".
    fromRef.current = currentRef.current.map((row) => ({ ...row }));
    targetRef.current = data;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      currentRef.current = targetRef.current.map((row, i) => {
        const from = fromRef.current[i];
        const next: Record<string, unknown> = { ...row };
        if (from) {
          for (const f of fields) {
            const a = from[f] as number | undefined;
            const b = row[f] as number;
            if (typeof a === 'number' && typeof b === 'number') {
              next[f as string] = lerp(a, b, eased);
            }
          }
        }
        return next as T;
      });
      force((n) => n + 1);
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
  }, [data, fields, durationMs]);

  return currentRef.current;
}
