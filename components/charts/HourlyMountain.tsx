// SoundSage — HourlyMountain
// Reimagining of the hour-of-day distribution as a sumi-e landscape painting:
// 一日の山並み — "the mountains of your day".
//
// Foreground mountain  : aggregate of all 24 hours, smooth quadratic ink wash
// Distant ranges       : layered translucent silhouettes for depth
// Sun arc              : dashed gold celestial path peaking at noon
// 日/月 markers        : sun at zenith, moons at both midnight edges
// Mist gradient        : softens the foot of the mountain into the horizon
// Hanko seal           : 峰 (summit) stamped above the peak hour
// Time-of-day kanji    : 夜 朝 昼 夕 anchored at quadrant centers
// Vertical signature   : 一日の山 stacked top-to-bottom on the right margin
// Hover                : drop-line + play count for the hour under the cursor

'use client';

import { useState, useRef, useMemo } from 'react';
import { Caps, Mono, hourLabel, fmtMins } from '../primitives';
import { useAnimatedSeries } from './useAnimatedSeries';
import type { HourlyBucket } from '../../types';

const ANIMATED_FIELDS: (keyof HourlyBucket)[] = ['plays', 'mins'];

interface HourlyMountainProps {
  data: HourlyBucket[]; // exactly 24 elements
  loading?: boolean;
}

// Layout constants — viewBox dimensions. Wider/shorter ratio (5:1) so the
// chart stays in a reasonable vertical band when stretched to full width.
// Outer container also caps max-width to prevent dominating ultra-wide
// screens.
const W = 1400;
const H = 280;
const PAD_L = 48;
const PAD_R = 48;
const PAD_T = 48; // room for the seal + 日 label
const PAD_B = 38; // room for the kanji time labels
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;
const BASELINE = PAD_T + INNER_H;

// Map an hour (0..24) to its center x within the SVG. We use 24 anchor
// columns; the curve passes through their centers.
function hourX(h: number): number {
  // Distribute 24 hours across the inner width with half-step padding so
  // the first/last bars don't ride against the borders.
  return PAD_L + (INNER_W / 24) * (h + 0.5);
}

// Smooth filled mountain path using Catmull-Rom → cubic Bezier conversion.
// Curve interpolates through every data point exactly so any dot drawn at a
// data point sits on the visible silhouette (the prior midpoint-quadratic
// smoothing passed through midpoints, leaving dots floating off the curve).
function buildMountainPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let d = `M ${first.x} ${BASELINE} L ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  d += ` L ${last.x} ${BASELINE} Z`;
  return d;
}

export function HourlyMountain({ data, loading }: HourlyMountainProps) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Smooth interpolation across range changes. The hook returns the same
  // 24-bucket shape, with `plays` and `mins` tweened from their previous
  // values to the current `data` values over ~600ms. We compute the path
  // and stamp position from `live` rather than `data` so the entire visual
  // morphs in lockstep.
  const live = useAnimatedSeries<HourlyBucket>(data, ANIMATED_FIELDS);

  // The hanko peak follows the target data, not the animated frame. Without
  // this the stamp would dance to a different hour mid-tween whenever the
  // peak shifts between ranges. We *do* read the animated y so the stamp
  // glides up/down vertically as the peak's height interpolates.
  const peakHr = useMemo(
    () =>
      data.length === 0
        ? 0
        : data.reduce((a, b) => (b.plays > a.plays ? b : a), data[0]!).hour,
    [data]
  );

  if (loading || data.length === 0) {
    return (
      <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ height: H, background: 'var(--paper-2)' }} />
      </div>
    );
  }

  // After the loading guard `data` is non-empty. `live` may briefly differ in
  // length on the first transition between empty and full data; fall back to
  // `data` until they line up.
  const series = live.length === data.length ? live : data;
  const max = Math.max(...series.map((d) => d.plays), 1);

  // Mountain points — y is mapped from baseline (0 plays) up to peak (max).
  const points = series.map((d) => ({
    x: hourX(d.hour),
    y: BASELINE - (d.plays / max) * INNER_H,
  }));
  const mountainPath = buildMountainPath(points);

  // Decorative distant ranges. We don't have per-weekday data, so we
  // conjure a sense of layered ridges by scaling the same silhouette down
  // and offsetting it. Three layers: tallest is the real foreground.
  const distantLayers = [
    { scale: 0.62, dx: 28, opacity: 0.08 },
    { scale: 0.78, dx: -22, opacity: 0.14 },
    { scale: 0.88, dx: 14, opacity: 0.22 },
  ].map((cfg) => ({
    ...cfg,
    path: buildMountainPath(
      points.map((p) => ({
        x: p.x + cfg.dx,
        y: BASELINE - (BASELINE - p.y) * cfg.scale,
      }))
    ),
  }));

  // Sun arc — single quadratic from midnight horizon → noon zenith → midnight horizon.
  const arcStart = { x: PAD_L + 4, y: BASELINE - 8 };
  const arcEnd = { x: W - PAD_R - 4, y: BASELINE - 8 };
  const arcPeakX = (arcStart.x + arcEnd.x) / 2;
  // Bezier control point above PAD_T pulls the visual apex down to about
  // PAD_T + 4 — keeps the arc inside the canvas with a nice curve.
  const arcControlY = PAD_T - 60;
  const sunArcD = `M ${arcStart.x} ${arcStart.y} Q ${arcPeakX} ${arcControlY}, ${arcEnd.x} ${arcEnd.y}`;
  const sunGlyphY = PAD_T + 18; // sits at the visual apex, not the control point

  // Time-of-day labels at quadrant centers (3a, 9a, 3p, 9p positions show
  // best — but we'll anchor to 12A, 6A, 12P, 6P as the description requests).
  const timeMarks: { hour: number; jp: string; en: string }[] = [
    { hour: 0, jp: '夜', en: 'night' },
    { hour: 6, jp: '朝', en: 'morning' },
    { hour: 12, jp: '昼', en: 'afternoon' },
    { hour: 18, jp: '夕', en: 'evening' },
  ];

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
    const hr = Math.min(23, Math.max(0, Math.floor(((localX - PAD_L) / INNER_W) * 24)));
    setHover(hr);
  }

  const peakX = hourX(peakHr);
  const peakY = BASELINE - (series[peakHr]!.plays / max) * INNER_H;

  const hoveredBucket = hover != null ? series[hover] : null;
  const hoveredX = hover != null ? hourX(hover) : null;
  const hoveredY = hover != null ? BASELINE - (series[hover]!.plays / max) * INNER_H : null;

  return (
    <div
      style={{
        padding: '24px 28px',
        borderBottom: '1px solid var(--rule)',
        position: 'relative',
      }}
    >
    <div style={{ maxWidth: 1380, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <div>
          <Caps>Fig. 二 — Peak listening times</Caps>
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontSize: 28,
              marginTop: 6,
              letterSpacing: '-0.01em',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mincho)',
                fontWeight: 500,
                fontSize: 24,
                color: 'var(--ink)',
                marginRight: 12,
              }}
            >
              一日の山並み
            </span>
            <span style={{ color: 'var(--muted)' }}>·</span>{' '}
            <em>the mountains of your day</em>
          </h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 26,
              color: 'var(--ink)',
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            {Math.round(hoveredBucket?.plays ?? series[peakHr]!.plays)}
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
              ? `${hourLabel(hoveredBucket.hour)} · PLAYS`
              : `${hourLabel(peakHr)} · PEAK · PLAYS`}
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
              ? `${fmtMins(Math.round(hoveredBucket.mins))} listened`
              : `${fmtMins(Math.round(series[peakHr]!.mins))} listened`}
          </div>
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
          <linearGradient id="hm-ink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.96" />
            <stop offset="0.65" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="hm-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--paper)" stopOpacity="0" />
            <stop offset="0.55" stopColor="var(--paper)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--paper)" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {/* Faint horizon line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={BASELINE}
          y2={BASELINE}
          stroke="var(--rule)"
          strokeOpacity="0.5"
        />

        {/* Sun/moon celestial path */}
        <path
          d={sunArcD}
          stroke="var(--gold)"
          strokeWidth="0.75"
          strokeDasharray="2 5"
          fill="none"
          opacity="0.6"
        />
        {/* Sun glyph at zenith */}
        <text
          x={arcPeakX}
          y={sunGlyphY}
          textAnchor="middle"
          fontFamily="var(--font-mincho)"
          fontSize="18"
          fill="var(--gold)"
          opacity="0.85"
        >
          日
        </text>
        {/* Moon markers at midnight edges */}
        <text
          x={arcStart.x}
          y={arcStart.y - 14}
          textAnchor="middle"
          fontFamily="var(--font-mincho)"
          fontSize="13"
          fill="var(--gold)"
          opacity="0.6"
        >
          月
        </text>
        <text
          x={arcEnd.x}
          y={arcEnd.y - 14}
          textAnchor="middle"
          fontFamily="var(--font-mincho)"
          fontSize="13"
          fill="var(--gold)"
          opacity="0.6"
        >
          月
        </text>

        {/* Distant translucent mountain ranges, back-to-front */}
        {distantLayers.map((layer, i) => (
          <path key={i} d={layer.path} fill="var(--ink)" opacity={layer.opacity} />
        ))}

        {/* Foreground mountain — the aggregate */}
        <path d={mountainPath} fill="url(#hm-ink)" />

        {/* Mist gradient overlay softens the foot of the range */}
        <rect x="0" y="0" width={W} height={H} fill="url(#hm-mist)" pointerEvents="none" />

        {/* Hover drop-line */}
        {hover != null && hoveredX != null && hoveredY != null && (
          <g>
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={hoveredY - 6}
              y2={BASELINE}
              stroke="var(--ink)"
              strokeWidth="0.75"
              strokeDasharray="2 3"
              opacity="0.8"
            />
            <circle cx={hoveredX} cy={hoveredY} r="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
          </g>
        )}

        {/* Peak hanko — 峰 (summit) stamped above the peak hour. We clamp
            the transform y so the rect never clips above the SVG top edge
            when the peak bar reaches maximum height (the rect extends 13px
            above the transform origin, so y must stay >= 30 to keep the
            stamp inside the viewBox with a small breathing margin). */}
        <g transform={`translate(${peakX}, ${Math.max(peakY - 16, 30)}) rotate(-4)`}>
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

        {/* Time-of-day kanji + English labels */}
        {timeMarks.map((m) => {
          const cx = hourX(m.hour);
          return (
            <g key={m.hour}>
              <text
                x={cx}
                y={H - PAD_B + 22}
                textAnchor="middle"
                fontFamily="var(--font-mincho)"
                fontSize="14"
                fontWeight="500"
                fill="var(--muted)"
              >
                {m.jp}
              </text>
              <text
                x={cx + 14}
                y={H - PAD_B + 23}
                textAnchor="start"
                fontFamily="var(--font-serif)"
                fontStyle="italic"
                fontSize="12"
                fill="var(--dim)"
              >
                {m.en}
              </text>
            </g>
          );
        })}

        {/* Hour ticks at the cardinal positions (12a, 6a, 12p, 6p) */}
        {[0, 6, 12, 18].map((h) => {
          const cx = hourX(h);
          return (
            <text
              key={h}
              x={cx}
              y={BASELINE + 12}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="10"
              fill="var(--dim)"
              letterSpacing="0.05em"
            >
              {hourLabel(h)}
            </text>
          );
        })}

        {/* Vertical signature column on the right margin: 一日の山 */}
        <g transform={`translate(${W - 16}, ${PAD_T + 4})`}>
          {['一', '日', 'の', '山'].map((ch, i) => (
            <text
              key={i}
              x={0}
              y={i * 18}
              textAnchor="middle"
              fontFamily="var(--font-mincho)"
              fontSize="14"
              fill="var(--seal)"
              opacity="0.75"
            >
              {ch}
            </text>
          ))}
        </g>
      </svg>
    </div>
    </div>
  );
}
