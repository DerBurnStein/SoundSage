// SoundSage — ActivityRibbon
// SVG bar chart of listening per bucket. Labels and density adapt to grain:
//   - 'hour' grain (24h range)   → "1AM, 2AM, ..."
//   - 'day' grain (7d/4w)        → "Sat / 17"
//   - 'week' grain (6m/1y)       → "May / 12" (week-start date)
//   - 'month' grain (all)        → "May / '26"
// Labels thin out automatically when there are too many bars to fit, so a
// 1-year view doesn't try to print 52 labels in a 700px-wide chart.
//
// Range-change animation: bars are right-anchored — the most recent bucket
// sits at the right edge and never moves. When the range grows, new older
// buckets slide in from past the left edge as the layout's stepX
// compresses to fit them all. When the range shrinks, the leftmost
// surplus bars slide off-screen left while the visible bars expand to
// the new layout's stepX. Same approach as WeeklySpark — the curve and
// the bar chart now share the "scroll past the left edge" feel.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Caps, Mono, hourLabel, fmtMins } from '../primitives';
import { useTheme } from '../ThemeProvider';
import type { ActivityBucket } from '../../types';

interface ActivityRibbonProps {
  data: ActivityBucket[];
  grain: 'hour' | 'day' | 'week' | 'month';
  loading?: boolean;
}

const W = 1400, H = 280, PAD_L = 48, PAD_R = 24, PAD_T = 20, PAD_B = 56;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const BASELINE = PAD_T + INNER_H;

const MAX_LABELS = 14;
const ANIM_DURATION = 700;
const BAR_DURATION  = 550;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
// CSS transitions for properties we DON'T drive frame-by-frame from the
// rAF scale loop. `x` and `width` are owned by the loop (a CSS transition
// on those would chase a moving target every frame and produce stutter),
// so they're absent. `y` and `height` only change between data updates,
// which is exactly the case where a CSS transition reads as a smooth
// re-shape rather than a snap.
const BAR_TRANSITION =
  `y ${BAR_DURATION}ms ${EASING}, ` +
  `height ${BAR_DURATION}ms ${EASING}, ` +
  `fill 0.12s`;

export function ActivityRibbon({ data, grain, loading }: ActivityRibbonProps) {
  const { reduceMotion } = useTheme();
  const [hover, setHover] = useState<number | null>(null);

  // Renders `renderedBuckets`. On a SHRINK, we keep showing the OLD (longer)
  // data while it slides off the left, then swap to the new shorter array
  // at animation end. On a GROW, we swap to the new array immediately and
  // let the new older-history bars slide in from beyond PAD_L as the
  // chart's stepX compresses. Same right-anchored playbook as WeeklySpark.
  const incomingProp = data;
  const [renderedBuckets, setRenderedBuckets] = useState<ActivityBucket[]>(
    () => incomingProp ?? []
  );
  const [scale, setScale] = useState(1);
  // `interp` is true for exactly one render after a buckets-shape swap.
  // While true, fresh bars render at heights *mapped from the previous
  // render's positions* (their "from" values). Next frame we flip it off,
  // bars re-render at their real target heights, and the CSS height
  // transition catches the change — so 4w↔6m feels like a re-shape rather
  // than a hard cut, even though the bucket keys are completely different.
  const [interp, setInterp] = useState(false);
  const animRafRef = useRef<number | null>(null);
  const lastSeenRef = useRef<ActivityBucket[] | undefined>(incomingProp);
  // Snapshot of the most recently *rendered* heights, used as the "from"
  // values when the buckets array is replaced.
  const prevHeightsRef = useRef<{ count: number; heights: number[] } | null>(null);

  useEffect(() => {
    if (incomingProp === lastSeenRef.current) return;
    lastSeenRef.current = incomingProp;
    const incoming = incomingProp ?? [];

    if (animRafRef.current != null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }

    const oldLen = renderedBuckets.length;
    const newLen = incoming.length;

    if (oldLen === newLen || oldLen <= 1 || newLen <= 1 || reduceMotion) {
      setRenderedBuckets(incoming);
      setScale(1);
      setInterp(true);
      return;
    }

    const start = performance.now();

    if (newLen > oldLen) {
      // GROW. Swap to new data immediately. Initial scale is newLen/oldLen
      // so the visible spacing equals the OLD chart's stepX — the rightmost
      // oldLen bars sit exactly where they were a frame ago, and the new
      // older-history bars sit off-screen past the left edge. As scale
      // unwinds toward 1 the bars compress inward and the new ones slide
      // in from the left.
      setRenderedBuckets(incoming);
      setInterp(true);
      const initial = newLen / oldLen;
      setScale(initial);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ANIM_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        setScale(initial + (1 - initial) * eased);
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          animRafRef.current = null;
        }
      };
      animRafRef.current = requestAnimationFrame(tick);
    } else {
      // SHRINK. Keep rendering the OLD data; spread it out (scale > 1) so
      // the rightmost newLen bars line up with the NEW layout's positions
      // and the leftmost (oldLen-newLen) bars slide off past PAD_L. At
      // animation end, swap to the new array invisibly.
      const target = oldLen / newLen;
      setScale(1);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ANIM_DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        setScale(1 + (target - 1) * eased);
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          setRenderedBuckets(incoming);
          setInterp(true);
          setScale(1);
          setHover(null);
          animRafRef.current = null;
        }
      };
      animRafRef.current = requestAnimationFrame(tick);
    }
  }, [incomingProp, renderedBuckets.length, reduceMotion]);

  // After a render that armed `interp`, flip it off next frame so the
  // *next* render re-applies the target heights and the CSS height
  // transition fires from the just-painted "from" heights to the targets.
  useEffect(() => {
    if (!interp) return;
    const id = requestAnimationFrame(() => setInterp(false));
    return () => cancelAnimationFrame(id);
  }, [interp]);

  // Snapshot the heights we actually rendered (resolved below as
  // `renderHeights`) so the next shape change has a "from" lookup table.
  // We only update the snapshot on settled renders so during a tween the
  // snapshot stays anchored to the *target* layout, not the morph frames.
  useEffect(() => {
    if (interp) return;
    prevHeightsRef.current = {
      count: renderedBuckets.length,
      heights: renderedBuckets.map((d) => {
        const m = Math.max(...renderedBuckets.map((b) => b.mins), 1);
        return (d.mins / m) * INNER_H;
      }),
    };
  }, [renderedBuckets, interp]);

  if (loading || !renderedBuckets.length) return <ActivityRibbonSkeleton />;

  const buckets = renderedBuckets;
  const max = Math.max(...buckets.map((d) => d.mins), 1);
  // Hover indexes into the *prop* data — the user's mental model is "I'm
  // pointing at my latest data", not "I'm pointing at whichever frozen
  // shrink-state is on screen". Falls back to renderedBuckets if hover
  // points past the end of the prop array (e.g. mid-shrink).
  const hoverSrc = data[hover ?? -1] ?? buckets[hover ?? -1] ?? null;
  const hoveredBucket = hover != null ? hoverSrc : null;

  // Right-anchored layout. Most recent bucket = far right; older buckets
  // step leftward by `stepX * scale`. During a length-change tween, scale
  // smoothly compresses (grow) or stretches (shrink) the spacing.
  const count = buckets.length;
  const stepX = INNER_W / count;
  const stepScaled = stepX * scale;
  // Bar width tracks the visual spacing, NOT the raw stepX. During a
  // shrink the rAF loop spreads bars apart (scale > 1) — pinning width to
  // stepX keeps them narrow even though the gaps grow, which reads as
  // "they never widen". With stepScaled, width grows in lockstep with the
  // gaps and the chart breathes properly between layouts. There's no jump
  // at swap either: scale*oldStepX at end of shrink === newStepX, so the
  // post-swap render hits the same width.
  const barW = stepScaled * 0.64;
  const peakIdx = buckets.findIndex((d) => d.mins === max);

  // Right-anchored layout. The most-recent bucket's right edge sits at
  // (W - PAD_R), and older buckets step left from there by stepScaled.
  // Critical: only the *spacing* scales with the tween — the rightmost
  // bar's anchor stays glued to (W - PAD_R) regardless of scale, so the
  // chart can't rubberband sideways during a length-change animation.
  function barRightX(i: number): number {
    return (W - PAD_R) - (count - 1 - i) * stepScaled;
  }
  function barCenterX(i: number): number {
    return barRightX(i) - barW / 2;
  }

  // Target heights for the current buckets, computed once per render.
  const targetHeights = buckets.map((d) => (d.mins / max) * INNER_H);

  // "From" heights — used for exactly the render that follows a buckets-
  // shape change. Map each new bar to a previous bar at the same fractional
  // position, then carry that bar's height across as the starting value.
  // The result: visual continuity from old layout to new, with the CSS
  // height transition handling the morph on the next render.
  const fromHeights: number[] | null =
    interp && prevHeightsRef.current && !reduceMotion
      ? buckets.map((_, i) => {
          const prev = prevHeightsRef.current!;
          if (prev.count <= 0) return targetHeights[i]!;
          const p = count <= 1 ? 1 : i / (count - 1);
          const i_old = Math.round(p * Math.max(0, prev.count - 1));
          return prev.heights[i_old] ?? targetHeights[i]!;
        })
      : null;

  const renderHeights = fromHeights ?? targetHeights;

  const labelStep = Math.max(1, Math.ceil(count / MAX_LABELS));
  function shouldLabel(i: number): boolean {
    if (i === 0) return true;
    if (i === count - 1) return true;
    if (i === peakIdx) return true;
    return i % labelStep === 0;
  }

  const peakBucket = buckets[peakIdx];
  const heading =
    peakBucket && grain === 'hour'
      ? `${hourLabel(new Date(peakBucket.t).getUTCHours())} was your loudest hour`
      : peakBucket
      ? `${primaryLabel(peakBucket, grain)} was your loudest ${
          grain === 'day' ? 'day' : grain === 'week' ? 'week' : 'month'
        }`
      : '—';

  return (
    <div
      style={{
        borderRight: '1px solid var(--rule)',
        borderBottom: '1px solid var(--rule)',
        padding: '24px 28px',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 18,
          }}
        >
          <div>
            <Caps>Fig. 一 — Daily listening</Caps>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                fontSize: 28,
                marginTop: 6,
                letterSpacing: '-0.01em',
              }}
            >
              <em>{peakBucket ? primaryLabel(peakBucket, grain) : '—'}</em>{' '}
              {heading.replace(primaryLabel(peakBucket!, grain), '').trim()}
            </h3>
          </div>
          <div style={{ textAlign: 'right', minWidth: 140 }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 26,
                color: 'var(--ink)',
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {fmtMins(Math.round((hoveredBucket ?? peakBucket)?.mins ?? 0))}
            </div>
            <Mono
              style={{
                fontSize: 10,
                color: 'var(--dim)',
                letterSpacing: '0.1em',
                marginTop: 4,
                display: 'block',
              }}
            >
              {hoveredBucket
                ? `${primaryLabel(hoveredBucket, grain)} · LISTENED`
                : peakBucket
                ? `${primaryLabel(peakBucket, grain)} · PEAK · LISTENED`
                : 'MIN · PLAYS'}
            </Mono>
            <div
              style={{
                fontFamily: 'var(--font-mincho)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--muted)',
                marginTop: 6,
                minHeight: '1em',
              }}
            >
              {hoveredBucket
                ? `${hoveredBucket.plays.toLocaleString()} plays`
                : peakBucket
                ? `${peakBucket.plays.toLocaleString()} plays`
                : ''}
            </div>
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          <defs>
            {/* Clip plot contents to the inner chart area so bars sliding
                past the left edge during a grow/shrink tween stay hidden
                instead of bleeding into the y-axis labels. */}
            <clipPath id="ar-plot">
              <rect x={PAD_L} y={0} width={W - PAD_L - PAD_R} height={H} />
            </clipPath>
          </defs>

          {/* Y-axis guide lines + ticks (outside the clip so the axis
              labels render normally even while bars slide past). */}
          {[0, 0.5, 1].map((t) => {
            const y = PAD_T + (1 - t) * INNER_H;
            const v = Math.round(t * max);
            return (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={y}
                  y2={y}
                  stroke="var(--rule)"
                  strokeOpacity={t === 0 ? 0.6 : 0.15}
                  strokeDasharray={t === 0 ? undefined : '2 4'}
                />
                <text
                  x={PAD_L - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                  fill="var(--dim)"
                >
                  {v}
                </text>
              </g>
            );
          })}

          <g clipPath="url(#ar-plot)">
            {buckets.map((d, i) => {
              const cx = barCenterX(i);
              const x = cx - barW / 2;
              const bh = renderHeights[i]!;
              const y = BASELINE - bh;
              const isHv = hover === i;
              const isPk = i === peakIdx;
              const showLabel = shouldLabel(i);
              const { primary, secondary } = formatLabel(d, grain);

              return (
                <g
                  // Stable key tied to the bucket's timestamp — NOT the
                  // index. With index keys, React reuses the same DOM node
                  // for completely different buckets when the array length
                  // changes (e.g. 6m → 1y), and CSS transitions on x/width
                  // then animate every bar across the chart, producing the
                  // rubberband. Stable keys mean each real bucket is one
                  // DOM node for its lifetime: shared buckets stay put,
                  // dropped buckets unmount cleanly, new buckets mount
                  // fresh at their target position.
                  key={d.t}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Transparent hit rect for easier hover */}
                  <rect
                    x={cx - stepScaled / 2}
                    y={PAD_T}
                    width={stepScaled}
                    height={INNER_H}
                    fill="transparent"
                    style={{ transition: BAR_TRANSITION }}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={bh}
                    fill={isPk ? 'var(--ember)' : isHv ? 'var(--moss-2)' : 'var(--accent)'}
                    style={{ transition: BAR_TRANSITION }}
                  />

                  {isPk && (
                    <g>
                      <line
                        x1={cx}
                        y1={y - 8}
                        x2={cx}
                        y2={y - 22}
                        stroke="var(--ember)"
                        strokeWidth="0.75"
                      />
                      <text
                        x={cx}
                        y={y - 26}
                        textAnchor="middle"
                        fontFamily="var(--font-serif)"
                        fontStyle="italic"
                        fontSize="11"
                        fill="var(--ember)"
                      >
                        peak — {d.mins}m
                      </text>
                    </g>
                  )}

                  {(showLabel || isHv) && (
                    <>
                      <text
                        x={cx}
                        y={H - PAD_B + 18}
                        textAnchor="middle"
                        fontFamily="var(--font-sans)"
                        fontSize="12"
                        fontWeight={isHv || isPk ? 600 : 400}
                        fill={isHv || isPk ? 'var(--ink)' : 'var(--muted)'}
                      >
                        {primary}
                      </text>
                      {secondary && (
                        <text
                          x={cx}
                          y={H - PAD_B + 32}
                          textAnchor="middle"
                          fontFamily="var(--font-mono)"
                          fontSize="10"
                          fill="var(--dim)"
                        >
                          {secondary}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

// ─── Label formatting per grain ───────────────────────────────────────────────

function formatLabel(
  b: ActivityBucket,
  grain: 'hour' | 'day' | 'week' | 'month'
): { primary: string; secondary?: string } {
  const d = new Date(b.t);
  switch (grain) {
    case 'hour':
      return { primary: hourLabel(d.getUTCHours()) };
    case 'day':
      return {
        primary: d.toLocaleDateString('en-US', { weekday: 'short' }),
        secondary: String(d.getDate()),
      };
    case 'week':
      return {
        primary: d.toLocaleDateString('en-US', { month: 'short' }),
        secondary: String(d.getDate()),
      };
    case 'month':
      return {
        primary: d.toLocaleDateString('en-US', { month: 'short' }),
        secondary: `'${String(d.getFullYear()).slice(2)}`,
      };
  }
}

function primaryLabel(b: ActivityBucket, grain: 'hour' | 'day' | 'week' | 'month'): string {
  const { primary, secondary } = formatLabel(b, grain);
  return secondary ? `${primary} ${secondary}` : primary;
}

function ActivityRibbonSkeleton() {
  return (
    <div
      style={{
        padding: '24px 28px',
        borderRight: '1px solid var(--rule)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ height: 24, width: 180, background: 'var(--paper-2)', marginBottom: 18 }} />
      <div style={{ height: H, background: 'var(--paper-2)' }} />
    </div>
  );
}
