// SoundSage — ActivityRibbon
// SVG bar chart of listening per bucket. Labels and density adapt to grain:
//   - 'hour' grain (24h range)   → "1AM, 2AM, ..."
//   - 'day' grain (7d/4w)        → "Sat / 17"
//   - 'week' grain (6m/1y)       → "May / 12" (week-start date)
//   - 'month' grain (all)        → "May / '26"
// Labels thin out automatically when there are too many bars to fit, so a
// 1-year view doesn't try to print 52 labels in a 700px-wide chart.
//
// Range-change animation: when the bar count changes, the bars+labels group
// briefly applies a scaleX transform that matches the *previous* layout's
// density, then animates to scale 1. Because the transform is centered on
// the chart, bars at the edges fly outward (off the viewBox) on growth and
// new edge bars fly inward — visually they "appear" from both the left and
// right walls. On shrinking the inverse plays.

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Caps, Mono, hourLabel } from '../primitives';
import type { ActivityBucket } from '../../types';

interface ActivityRibbonProps {
  data: ActivityBucket[];
  grain: 'hour' | 'day' | 'week' | 'month';
  loading?: boolean;
}

// Wider viewBox (5:1) so the chart stays in a reasonable vertical band
// when stretched to full width. Outer container also caps max-width to
// match HourlyMountain's editorial sizing.
const W = 1400, H = 280, PAD_L = 48, PAD_R = 24, PAD_T = 20, PAD_B = 56;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const BASELINE = PAD_T + INNER_H;
const CHART_CX = PAD_L + INNER_W / 2;

// Maximum number of bars we want to label horizontally before they collide.
const MAX_LABELS = 14;

const ZOOM_DURATION = 650;
const BAR_DURATION  = 550;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const BAR_TRANSITION =
  `x ${BAR_DURATION}ms ${EASING}, y ${BAR_DURATION}ms ${EASING}, ` +
  `width ${BAR_DURATION}ms ${EASING}, height ${BAR_DURATION}ms ${EASING}, ` +
  `fill 0.12s`;

export function ActivityRibbon({ data, grain, loading }: ActivityRibbonProps) {
  const [hover, setHover] = useState<number | null>(null);
  const groupRef = useRef<SVGGElement>(null);
  const prevLenRef = useRef(data.length);

  // useLayoutEffect runs synchronously after DOM mutations and *before* the
  // browser paints, so we can imperatively snap the group's transform to
  // the initial ratio (no transition) and immediately schedule the
  // animation back to 1 (with transition). This avoids the wobble you get
  // when the snap itself is animated by a state-driven CSS transition.
  useLayoutEffect(() => {
    const oldLen = prevLenRef.current;
    const newLen = data.length;
    const g = groupRef.current;
    prevLenRef.current = newLen;
    if (!g || oldLen === newLen || oldLen === 0 || newLen === 0) return;

    const ratio = newLen / oldLen;
    // Step 1: kill the transition, set the snap scale instantly. The
    // forced reflow commits this state before paint.
    g.style.transition = 'none';
    g.style.transform = `scaleX(${ratio})`;
    void g.getBoundingClientRect();
    // Step 2: re-enable the transition, animate back to identity scale.
    g.style.transition = `transform ${ZOOM_DURATION}ms ${EASING}`;
    g.style.transform = 'scaleX(1)';
  }, [data.length]);

  if (loading || !data.length) return <ActivityRibbonSkeleton />;

  const max = Math.max(...data.map((d) => d.mins), 1);
  const stepX = INNER_W / data.length;
  const barW = stepX * 0.64;
  const peakIdx = data.findIndex((d) => d.mins === max);
  const halfRange = (data.length - 1) / 2;

  const labelStep = Math.max(1, Math.ceil(data.length / MAX_LABELS));
  function shouldLabel(i: number): boolean {
    if (i === 0) return true;
    if (i === data.length - 1) return true;
    if (i === peakIdx) return true;
    return i % labelStep === 0;
  }

  // Bar centre x for index i — centred chart layout (the data array's middle
  // sits at CHART_CX, not at the left edge).
  function barCenterX(i: number): number {
    return CHART_CX + (i - halfRange) * stepX;
  }

  // Heading text picks the right phrasing per grain.
  const peakBucket = data[peakIdx];
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
          <Mono style={{ color: 'var(--dim)', fontSize: 10 }}>min · plays</Mono>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
          {/* Y-axis guide lines + ticks (outside the scaling group so the
              axis numbers don't squash horizontally during the zoom). */}
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

          {/* Bars + per-bar labels — wrapped in a scaling group whose origin
              is the chart's horizontal centre. When data.length changes,
              useLayoutEffect imperatively snaps the scale to (newLen/oldLen)
              with no transition, then animates it back to 1. Edge bars go
              beyond the viewBox during the snap and slide back in via the
              transition — that's the "from both walls" effect. */}
          <g
            ref={groupRef}
            style={{
              transform: 'scaleX(1)',
              transformOrigin: `${CHART_CX}px ${BASELINE}px`,
              transformBox: 'view-box',
              transition: `transform ${ZOOM_DURATION}ms ${EASING}`,
            }}
          >
            {data.map((d, i) => {
              const cx = barCenterX(i);
              const x = cx - barW / 2;
              const bh = (d.mins / max) * INNER_H;
              const y = BASELINE - bh;
              const isHv = hover === i;
              const isPk = i === peakIdx;
              const showLabel = shouldLabel(i);
              const { primary, secondary } = formatLabel(d, grain);

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Transparent hit rect for easier hover */}
                  <rect
                    x={cx - stepX / 2}
                    y={PAD_T}
                    width={stepX}
                    height={INNER_H}
                    fill="transparent"
                    style={{ transition: BAR_TRANSITION }}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={bh}
                    fill={isPk ? 'var(--ember)' : isHv ? 'var(--moss-2)' : 'var(--ink)'}
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
