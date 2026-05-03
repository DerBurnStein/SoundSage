// SoundSage — WeeklySpark
// Editorial 12-week ribbon chart. Reads as the season's flow:
// 12週の軌跡 (twelve-week trace).
//
// Layout:
//   • Smooth ink curve through 12 weekly minute totals
//   • Soft area fill underneath (gradient fade)
//   • Faint vertical stems at each week tick
//   • Solid ink dots on each week, with the most-recent week in ember
//   • Peak week stamped with a 峰 hanko above its node
//   • Faint dashed trend line (linear regression)
//   • Week-start dates along the bottom
//   • Right-rail stats: total / weekly average / peak
//   • Hover anywhere → vertical drop-line + scaled dot + floating tooltip

'use client';

import { useState, useRef } from 'react';
import { Caps, Mono, fmtMins } from '../primitives';
import type { WeeklySpark as WeeklySparkData } from '../../types';

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

function smoothPath(pts: { x: number; y: number }[], close = false): string {
  if (pts.length === 0) return '';
  const first = pts[0]!;
  let d = '';
  if (close) d += `M ${first.x} ${BASELINE} L ${first.x} ${first.y}`;
  else d += `M ${first.x} ${first.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    d += ` Q ${a.x} ${a.y} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
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

function weekStartDate(weekIndex: number): Date {
  // weekIndex 0 = oldest of the 12 weeks, 11 = current week. Start of the
  // window is 12 weeks ago. We mirror getWeekly's UTC alignment so the
  // labels match the data buckets.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (11 - weekIndex) * 7);
  return d;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WeeklySpark({ data, loading }: WeeklySparkProps) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (loading || !data?.weeks?.length) return <Skeleton />;

  const weeks = data.weeks;
  const max = Math.max(...weeks, 1);
  const total = weeks.reduce((s, v) => s + v, 0);
  const avg = Math.round(total / weeks.length);
  const peakIdx = weeks.indexOf(Math.max(...weeks));
  const lastIdx = weeks.length - 1;

  const stepX = INNER_W / Math.max(1, weeks.length - 1);
  const points = weeks.map((v, i) => ({
    x: PAD_L + i * stepX,
    y: BASELINE - (v / max) * INNER_H,
    v,
    date: weekStartDate(i),
  }));

  const trend = linearTrend(weeks);
  const trendStart = {
    x: PAD_L,
    y: BASELINE - (Math.max(0, trend.intercept) / max) * INNER_H,
  };
  const trendEnd = {
    x: PAD_L + (weeks.length - 1) * stepX,
    y:
      BASELINE -
      (Math.max(0, trend.intercept + trend.slope * (weeks.length - 1)) / max) *
        INNER_H,
  };

  const linePath = smoothPath(points, false);
  const fillPath = smoothPath(points, true);

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
    const idx = Math.round((localX - PAD_L) / stepX);
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
            <Caps>Fig. 五 — Twelve-week trace</Caps>
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
                12週の軌跡
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
              value={fmtMins(peakPt.v)}
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
              <stop offset="0" stopColor="var(--ink)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--ink)" stopOpacity="0" />
            </linearGradient>
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

          {/* Vertical stems — one per week, faint */}
          {points.map((p, i) => (
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
          ))}

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
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Week dots */}
          {points.map((p, i) => {
            const isHv = hover === i;
            const isLast = i === lastIdx;
            const r = isHv ? 5 : isLast ? 4 : 3;
            return (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={r}
                fill={isLast ? 'var(--ember)' : 'var(--ink)'}
                stroke="var(--paper)"
                strokeWidth={isLast || isHv ? 2 : 1}
                style={{ transition: 'r 0.12s' }}
              />
            );
          })}

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
                const text = fmtMins(focused.v);
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

          {/* Week labels along bottom */}
          {points.map((p, i) => {
            const isHv = hover === i;
            const isCurrent = i === lastIdx;
            // Always show first, last, peak, and every other otherwise to
            // avoid visual crowding at 12 ticks
            const showLabel = isHv || isCurrent || i === 0 || i === peakIdx || i % 2 === 0;
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
