// SoundSage — WeeklySpark
// Editorial multi-week ribbon chart. Reads as the season's flow.
// Trailing-N weeks where N is driven by the time-range picker via
// weeksForRange() in lib/page-data.ts (12 for short ranges, 26 for 6m,
// 52 for 1y, 78 for all). Heading + label thinning + the kanji prefix
// adapt to the count so the chart reads cleanly at any size.
//
// Layout:
//   • Smooth ink curve through N weekly minute totals
//   • Soft area fill underneath (gradient fade)
//   • Faint vertical stems at each week tick (hidden at high counts)
//   • Solid ink dots on each week, with the most-recent week in ember
//   • Peak week stamped with a 峰 hanko above its node
//   • Faint dashed trend line (linear regression)
//   • Week-start dates along the bottom (thinned at high counts)
//   • Right-rail stats: total / weekly average / peak
//   • Hover anywhere → vertical drop-line + scaled dot + floating tooltip

'use client';

import { useEffect, useRef, useState } from 'react';
import { Caps, Mono, fmtMins } from '../primitives';
import { useTheme } from '../ThemeProvider';
import type { WeeklySpark as WeeklySparkData } from '../../types';

// ─── useAnimatedWeeks ────────────────────────────────────────────────────────
// Right-aligned, zero-padded animation for the trailing-N-weeks data:
//
//   - When the array length grows (4w → 6m), new entries are *older*
//     history that didn't exist before. We pad the previous array on the
//     LEFT with zeros so the new bars grow up from the baseline rather
//     than popping in at full height.
//   - When the array shrinks, we trim the leftmost old entries.
//   - In both cases, the current-week (rightmost) bar is paired with the
//     prior current-week bar across the transition, so its value lerps
//     smoothly instead of jumping to whatever was at the same index in
//     the old smaller array.
//
// The generic useAnimatedSeries hook is left-aligned by index, which
// pairs unrelated time periods when the count changes — that was the
// "only half of the graph interpolates" bug.
function useAnimatedWeeks(weeks: number[], duration = 700, reduceMotion = false): number[] {
  const [, force] = useState(0);
  const currentRef = useRef<number[]>(weeks);
  const fromRef    = useRef<number[]>(weeks);
  const targetRef  = useRef<number[]>(weeks);
  const startRef   = useRef(0);
  const rafRef     = useRef<number | null>(null);
  const firstRef   = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      currentRef.current = weeks;
      targetRef.current = weeks;
      return;
    }
    if (weeks === targetRef.current) return;

    // Reduce motion: snap to the new values, skip rAF entirely.
    if (reduceMotion) {
      currentRef.current = weeks.slice();
      targetRef.current = weeks;
      force((n) => n + 1);
      return;
    }

    // Right-align fromRef to weeks: pad LEFT with zeros if growing,
    // trim from LEFT if shrinking. Anchor: rightmost (current week).
    const old = currentRef.current;
    const newLen = weeks.length;
    const oldLen = old.length;
    let aligned: number[];
    if (newLen > oldLen) {
      aligned = new Array<number>(newLen - oldLen).fill(0).concat(old);
    } else if (newLen < oldLen) {
      aligned = old.slice(oldLen - newLen);
    } else {
      aligned = old.slice();
    }

    fromRef.current   = aligned;
    targetRef.current = weeks;
    startRef.current  = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      currentRef.current = targetRef.current.map((v, i) => {
        const f = fromRef.current[i] ?? 0;
        return f + (v - f) * eased;
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
  }, [weeks, duration, reduceMotion]);

  return currentRef.current;
}

interface WeeklySparkProps {
  data: WeeklySparkData;
  loading?: boolean;
}

const W = 1400;
const H = 280;
const PAD_L = 56;
const PAD_R = 56;
const PAD_T = 56;
const PAD_B = 56;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const BASELINE = PAD_T + INNER_H;

// Catmull-Rom → cubic Bezier conversion. The previous midpoint-quadratic
// smoothing only passed *through* the midpoints between consecutive data
// points, so visually the dots (rendered at the data points) often floated
// off the curve. This variant interpolates through every data point exactly.
// Tension = 0.5 (uniform Catmull-Rom). Endpoints are duplicated to give the
// first and last segments well-defined tangents.
function smoothPath(pts: { x: number; y: number }[], close = false): string {
  if (pts.length === 0) return '';
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let d = '';
  if (close) d += `M ${first.x} ${BASELINE} L ${first.x} ${first.y}`;
  else d += `M ${first.x} ${first.y}`;
  if (pts.length === 1) {
    if (close) d += ` L ${first.x} ${BASELINE} Z`;
    return d;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  if (close) d += ` L ${last.x} ${BASELINE} Z`;
  return d;
}

function linearTrend(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]!; sumXY += i * values[i]!; sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function weekStartDate(weekIndex: number, weekCount: number): Date {
  // weekIndex 0 = oldest of the N weeks, weekCount-1 = current week. Start
  // of the window is `weekCount` weeks ago. Mirrors getWeekly's UTC
  // alignment so the labels match the data buckets.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (weekCount - 1 - weekIndex) * 7);
  return d;
}

/** Editorial label for the count, e.g. 12 → "Twelve-week trace". */
function traceLabel(n: number): string {
  if (n <= 12) return 'Twelve-week trace';
  if (n <= 26) return 'Half-year trace';
  if (n <= 52) return 'Year-long trace';
  return `${n}-week trace`;
}

function kanjiTrace(n: number): string {
  if (n <= 12) return '12週の軌跡';
  if (n <= 26) return '半年の軌跡';
  if (n <= 52) return '一年の軌跡';
  return `${n}週の軌跡`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WeeklySpark({ data, loading }: WeeklySparkProps) {
  const { reduceMotion } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ─── Data + scale animation ────────────────────────────────────────────
  // We render `renderedWeeks` (an internally-tracked array) so that on a
  // SHRINK we can keep showing the old (longer) data while it slides off
  // to the left, then swap to the new shorter array once the visible
  // region matches the new chart's layout. On a GROW we swap to the new
  // longer data immediately and let the new bars fly in from off-screen
  // left as the scale unwinds.
  // We track `data?.weeks` (which may be undefined) directly in
  // lastSeenRef so we don't trigger spurious effect runs from inline
  // `?? []` fallbacks that create fresh array refs each render.
  const incomingProp = data?.weeks;
  const [renderedWeeks, setRenderedWeeks] = useState<number[]>(
    () => incomingProp ?? []
  );
  const [scale, setScale] = useState(1);
  const animRafRef = useRef<number | null>(null);
  const lastSeenRef = useRef<number[] | undefined>(incomingProp);

  useEffect(() => {
    if (incomingProp === lastSeenRef.current) return;
    lastSeenRef.current = incomingProp;
    const incoming = incomingProp ?? [];

    // Cancel any in-flight animation so a rapid sequence of range clicks
    // doesn't pile up overlapping rAF loops.
    if (animRafRef.current != null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }

    const oldLen = renderedWeeks.length;
    const newLen = incoming.length;
    const duration = 700;

    if (oldLen === newLen || oldLen <= 1 || newLen <= 1 || reduceMotion) {
      setRenderedWeeks(incoming);
      setScale(1);
      return;
    }

    const start = performance.now();

    if (newLen > oldLen) {
      // GROW (e.g. 12 → 26). Swap data to NEW immediately. Scale starts
      // at (newLen-1)/(oldLen-1) so the rightmost oldLen bars sit at the
      // previous chart's stepX (the chart visually still looks like the
      // old chart). Animate scale to 1 → new older-history bars on the
      // left slide in from beyond the chart's left edge.
      setRenderedWeeks(incoming);
      const initial = (newLen - 1) / (oldLen - 1);
      setScale(initial);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
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
      // SHRINK (e.g. 52 → 26). Keep rendering the OLD data. Scale
      // animates from 1 to (oldLen-1)/(newLen-1) — bars spread out to
      // the right, and the leftmost (oldLen-newLen) bars slide off-
      // screen past PAD_L. At animation end, the rightmost newLen bars
      // of OLD now sit at exactly the NEW chart's positions (and have
      // identical values, since same time periods), so we can swap to
      // the new array invisibly.
      const target = (oldLen - 1) / (newLen - 1);
      setScale(1);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setScale(1 + (target - 1) * eased);
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          // Continuity swap: old at scale=target visually equals new at
          // scale=1, so this transition produces no visible jump.
          setRenderedWeeks(incoming);
          setScale(1);
          setHover(null); // hover index might point to a now-removed bar
          animRafRef.current = null;
        }
      };
      animRafRef.current = requestAnimationFrame(tick);
    }
  }, [incomingProp, renderedWeeks.length, reduceMotion]);

  // Right-aligned value lerp on top of whichever array we're rendering.
  // Returns the same shape; values lerp where index alignment matches.
  const live = useAnimatedWeeks(renderedWeeks, 700, reduceMotion);

  // Guard on both sides — `renderedWeeks` lags `data.weeks` by one render
  // when data first arrives, so we'd otherwise compute against an empty
  // array for one frame.
  if (loading || !data?.weeks?.length || !renderedWeeks.length) {
    return <Skeleton />;
  }

  // On the very first render after a renderedWeeks length change, `live`
  // hasn't realigned yet (effect runs after render). Apply the same
  // right-anchor + zero-pad / trim logic the hook uses internally so the
  // first frame already shows the "from" state, ready to lerp.
  const oldLen = live.length;
  const newLen = renderedWeeks.length;
  const weeks =
    oldLen === newLen
      ? live
      : oldLen < newLen
        ? new Array<number>(newLen - oldLen).fill(0).concat(live)
        : live.slice(oldLen - newLen);
  const max = Math.max(...weeks, 1);
  const total = Math.round(weeks.reduce((s, v) => s + v, 0));
  const avg = Math.round(total / weeks.length);
  // Pin peakIdx to the rendered (target) data so the 峰 stamp doesn't
  // dance sideways mid-tween whenever interpolated values cross.
  const peakIdx = renderedWeeks.indexOf(Math.max(...renderedWeeks));
  const lastIdx = weeks.length - 1;

  const weekCount = weeks.length;
  const stepX = INNER_W / Math.max(1, weekCount - 1);
  // x is anchored to the right edge (current week stays at W-PAD_R) and
  // multiplied by `scale` so that during a length-change animation the
  // bars start spread out at the *previous* chart's stepX and compress
  // inward as scale settles to 1. New older-history bars on the left
  // sit beyond the chart's visible viewBox at high scale and slide in.
  const visualX = (i: number) =>
    (W - PAD_R) - (weekCount - 1 - i) * stepX * scale;
  const points = weeks.map((v, i) => ({
    x: visualX(i),
    y: BASELINE - (v / max) * INNER_H,
    v,
    date: weekStartDate(i, weekCount),
  }));

  // Label thinning. At 12 weeks every other tick gets a date label, but a
  // 78-week trace would crowd if we kept the same density — scale stride
  // up so we land at roughly 8–14 visible labels regardless of count.
  const labelStride = Math.max(1, Math.round(weekCount / 8));
  // Stems behind dots get visually noisy past ~30 weeks; hide them at
  // high counts so the curve dominates.
  const showStems = weekCount <= 30;

  const trend = linearTrend(weeks);
  // Trend line endpoints follow the leftmost / rightmost *visual* x so the
  // line stays glued to the actual data points during the scale tween.
  const trendStart = {
    x: visualX(0),
    y: BASELINE - (Math.max(0, trend.intercept) / max) * INNER_H,
  };
  const trendEnd = {
    x: visualX(weeks.length - 1),
    y:
      BASELINE -
      (Math.max(0, trend.intercept + trend.slope * (weeks.length - 1)) / max) *
        INNER_H,
  };

  // When the requested range exceeds available history, leading buckets are
  // genuine zeros — but visually that reads as "you listened to nothing
  // that week" rather than "your history doesn't reach back this far".
  // Leading-edge floor: walk left-to-right and raise any leading point
  // that would otherwise dip below its right neighbor up to the neighbor's
  // height. Stops at the first point that's already at or above its
  // successor (i.e., the curve naturally starts rising/flat there). This
  // hides "falloff to zero" for tail-of-history ranges without introducing
  // a hard threshold — the rule is applied identically in every range, so
  // when the chart tweens between ranges the leftmost height lerps
  // smoothly with no snap at the resting state.
  const drawnPoints = points.map((p) => ({ ...p }));
  for (let i = 0; i < drawnPoints.length - 1; i++) {
    const cur = drawnPoints[i]!;
    const nxt = drawnPoints[i + 1]!;
    if (cur.y > nxt.y) {
      cur.y = nxt.y;
    } else {
      break;
    }
  }
  // Hover bubble + dots still need to know which leading buckets were
  // synthesised vs real, so we can suppress dots over the held-flat zone.
  let firstReal = 0;
  while (
    firstReal < drawnPoints.length - 1 &&
    drawnPoints[firstReal]!.y !== points[firstReal]!.y
  ) {
    firstReal++;
  }

  const linePath = smoothPath(drawnPoints, false);
  const fillPath = smoothPath(drawnPoints, true);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const localX = ratio * W;
    if (localX < PAD_L || localX > W - PAD_R) {
      setHover(null);
      return;
    }
    // Inverted visualX so hover detection matches the scaled bar
    // positions during the length-change tween. Clamps the answer to a
    // valid bar index so a hover on an off-screen left bar (when scale
    // is large) still resolves to bar 0.
    const stepScaled = stepX * scale;
    const idx = Math.round(
      (weeks.length - 1) - (W - PAD_R - localX) / stepScaled
    );
    setHover(Math.max(0, Math.min(weeks.length - 1, idx)));
  }

  const focused = hover != null ? points[hover]! : null;
  const peakPt = points[peakIdx]!;

  return (
    <div
      style={{
        padding: '24px 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 14,
            gap: 24,
          }}
        >
          <div>
            <Caps>Fig. 五 — {traceLabel(weekCount)}</Caps>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                fontSize: 26,
                marginTop: 6,
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mincho)',
                  fontSize: 22,
                  marginRight: 12,
                  color: 'var(--ink)',
                }}
              >
                {kanjiTrace(weekCount)}
              </span>
              <span style={{ color: 'var(--muted)' }}>·</span>{' '}
              <em>the season&apos;s flow</em>
            </h3>
          </div>

          {/* Stats rail */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              alignItems: 'flex-start',
              flexShrink: 0,
            }}
          >
            <Stat label="Total" value={fmtMins(total)} accent="ink" />
            <Stat label="Weekly avg" value={fmtMins(avg)} accent="muted" />
            <Stat
              label="Peak"
              value={fmtMins(Math.round(peakPt.v))}
              footnote={shortDate(peakPt.date)}
              accent="ember"
            />
          </div>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: 'block', cursor: 'crosshair' }}
        >
          <defs>
            <linearGradient id="ws-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            {/* Clip the curve / fill / dots to the inner plot area so the
                scale-animation can't bleed past the left edge while bars
                slide in from beyond PAD_L. Padding on top/bottom keeps the
                hanko stamp + axis labels outside the clip. */}
            <clipPath id="ws-plot">
              <rect
                x={PAD_L}
                y={0}
                width={W - PAD_L - PAD_R}
                height={H}
              />
            </clipPath>
          </defs>

          {/* Horizontal gridlines */}
          {[0.25, 0.5, 0.75].map((t) => {
            const y = BASELINE - t * INNER_H;
            return (
              <line
                key={t}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke="var(--rule)"
                strokeOpacity="0.4"
                strokeDasharray="2 4"
              />
            );
          })}

          {/* Baseline */}
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={BASELINE}
            y2={BASELINE}
            stroke="var(--rule)"
          />

          {/* Everything that's positioned by the scale-animated visualX
              sits inside this clipped group so it can't bleed past PAD_L
              while bars slide in from beyond the left edge during a grow
              transition. */}
          <g clipPath="url(#ws-plot)">
          {/* Vertical stems — one per week, faint. Hidden at high week
              counts so the curve dominates instead of becoming a picket
              fence. The hovered week always renders its stem regardless. */}
          {points.map((p, i) => {
            if (i < firstReal) return null;
            if (!showStems && hover !== i) return null;
            return (
              <line
                key={`stem-${i}`}
                x1={p.x}
                x2={p.x}
                y1={BASELINE}
                y2={p.y}
                stroke="var(--ink)"
                strokeOpacity={hover === i ? 0.4 : 0.12}
                strokeWidth="1"
              />
            );
          })}

          {/* Filled area */}
          <path d={fillPath} fill="url(#ws-fill)" />

          {/* Trend line — dashed, subtle */}
          <line
            x1={trendStart.x}
            y1={trendStart.y}
            x2={trendEnd.x}
            y2={trendEnd.y}
            stroke="var(--seal)"
            strokeWidth="0.75"
            strokeDasharray="3 5"
            opacity="0.55"
          />

          {/* Main smooth curve */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Week dots */}
          {drawnPoints.map((p, i) => {
            if (i < firstReal) return null;
            const isHv = hover === i;
            const isLast = i === lastIdx;
            const r = isHv ? 5 : isLast ? 4 : 3;
            return (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={isLast ? 'var(--ember)' : 'var(--accent)'}
                stroke="var(--paper)"
                strokeWidth={isLast || isHv ? 2 : 1}
                style={{ transition: 'r 0.12s' }}
              />
            );
          })}
          </g>{/* /clipped plot group */}

          {/* Peak hanko stamp — only render if peak week isn't the
              current week (which already has the ember dot) */}
          {peakIdx !== lastIdx && (
            <g transform={`translate(${peakPt.x}, ${peakPt.y - 22}) rotate(-4)`}>
              <rect
                x={-13}
                y={-13}
                width={26}
                height={26}
                fill="var(--ember)"
                stroke="var(--paper)"
                strokeWidth="1"
              />
              <text
                x={0}
                y={5}
                textAnchor="middle"
                fontFamily="var(--font-mincho)"
                fontSize="16"
                fontWeight="700"
                fill="var(--paper)"
              >
                峰
              </text>
              <line
                x1={0}
                y1={13}
                x2={0}
                y2={20}
                stroke="var(--ember)"
                strokeWidth="0.75"
              />
            </g>
          )}

          {/* Hover drop-line + value bubble */}
          {focused && (
            <g pointerEvents="none">
              <line
                x1={focused.x}
                x2={focused.x}
                y1={focused.y - 8}
                y2={BASELINE}
                stroke="var(--ink)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.7"
              />
              {/* Value bubble — smart-position so it doesn't escape edges */}
              {(() => {
                const text = fmtMins(Math.round(focused.v));
                const dateText = shortDate(focused.date);
                const bubbleW = 96;
                const bubbleH = 38;
                const tip = 6;
                let bx = focused.x - bubbleW / 2;
                if (bx < PAD_L) bx = PAD_L;
                if (bx + bubbleW > W - PAD_R) bx = W - PAD_R - bubbleW;
                const by = focused.y - bubbleH - tip - 4;
                return (
                  <g>
                    <rect
                      x={bx}
                      y={by}
                      width={bubbleW}
                      height={bubbleH}
                      fill="var(--paper)"
                      stroke="var(--ink)"
                      strokeWidth="0.75"
                    />
                    <text
                      x={bx + bubbleW / 2}
                      y={by + 16}
                      textAnchor="middle"
                      fontFamily="var(--font-serif)"
                      fontSize="14"
                      fontWeight="500"
                      fill="var(--ink)"
                    >
                      {text}
                    </text>
                    <text
                      x={bx + bubbleW / 2}
                      y={by + 30}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize="9"
                      fill="var(--dim)"
                      letterSpacing="0.05em"
                    >
                      week of {dateText}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Week labels along bottom — strided so they stay readable at
              78-week traces. First / last / peak / hovered always render. */}
          {points.map((p, i) => {
            const isHv = hover === i;
            const isCurrent = i === lastIdx;
            const showLabel =
              isHv || isCurrent || i === 0 || i === peakIdx || i % labelStride === 0;
            if (!showLabel) return null;
            return (
              <text
                key={`label-${i}`}
                x={p.x}
                y={H - PAD_B + 22}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize={isHv || isCurrent ? 11 : 10}
                fill={isHv || isCurrent ? 'var(--ink)' : 'var(--dim)'}
                fontWeight={isHv || isCurrent ? 600 : 400}
                style={{ transition: 'fill 0.12s' }}
              >
                {shortDate(p.date)}
              </text>
            );
          })}

          {/* Right edge axis cap */}
          <text
            x={PAD_L - 8}
            y={PAD_T + 4}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--dim)"
            letterSpacing="0.05em"
          >
            {fmtMins(max)}
          </text>
          <text
            x={PAD_L - 8}
            y={BASELINE + 3}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--dim)"
          >
            0
          </text>
        </svg>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  footnote,
  accent,
}: {
  label: string;
  value: string;
  footnote?: string;
  accent: 'ink' | 'muted' | 'ember';
}) {
  const color =
    accent === 'ember' ? 'var(--ember)' : accent === 'muted' ? 'var(--muted)' : 'var(--ink)';
  return (
    <div style={{ textAlign: 'right' }}>
      <Mono
        style={{
          fontSize: 9,
          color: 'var(--dim)',
          letterSpacing: '0.1em',
          display: 'block',
        }}
      >
        {label.toUpperCase()}
      </Mono>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 500,
          color,
          marginTop: 4,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {footnote && (
        <Mono style={{ fontSize: 9, color: 'var(--dim)', marginTop: 4, display: 'block' }}>
          {footnote}
        </Mono>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <div style={{ height: 14, width: 120, background: 'var(--paper-2)', marginBottom: 12 }} />
        <div style={{ height: 26, width: 360, background: 'var(--paper-2)', marginBottom: 18 }} />
        <div style={{ height: H, background: 'var(--paper-2)' }} />
      </div>
    </div>
  );
}
