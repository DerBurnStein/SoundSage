// SoundSage — ActivityRibbon
// SVG bar chart of daily listening minutes.
// Props-driven: feed it ActivityBucket[] from /api/stats/activity.

'use client';

import { useState } from 'react';
import { Caps, Mono, pad2 } from '../primitives';
import type { ActivityBucket } from '../../types';

interface ActivityRibbonProps {
  data:    ActivityBucket[];
  loading?: boolean;
}

const W = 700, H = 220, PAD_L = 36, PAD_R = 12, PAD_T = 16, PAD_B = 28;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

export function ActivityRibbon({ data, loading }: ActivityRibbonProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (loading || !data.length) return <ActivityRibbonSkeleton />;

  const max      = Math.max(...data.map(d => d.mins));
  const stepX    = INNER_W / data.length;
  const peakIdx  = data.findIndex(d => d.mins === max);

  // Format bucket label — just show day name if grain = day, etc.
  const label = (b: ActivityBucket) => {
    const d = new Date(b.t);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div style={{
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      padding: '24px 28px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <div>
          <Caps>Fig. 一 — Daily listening</Caps>
          <h3 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 28,
            marginTop: 6, letterSpacing: '-0.01em',
          }}>
            <em>{data[peakIdx] ? label(data[peakIdx]) : '—'}</em> was your loudest day
          </h3>
        </div>
        <Mono style={{ color: 'var(--dim)', fontSize: 10 }}>min · plays</Mono>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* Y-axis guide lines */}
        {[0, 0.5, 1].map(t => {
          const y = PAD_T + (1 - t) * INNER_H;
          const v = Math.round(t * max);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke="var(--rule)" strokeOpacity={t === 0 ? 0.6 : 0.15}
                strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end"
                fontFamily="var(--font-mono)" fontSize="9" fill="var(--dim)">{v}</text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x    = PAD_L + i * stepX + stepX * 0.18;
          const bw   = stepX * 0.64;
          const bh   = (d.mins / max) * INNER_H;
          const y    = PAD_T + INNER_H - bh;
          const isHv = hover === i;
          const isPk = i === peakIdx;

          return (
            <g key={d.t}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={PAD_L + i * stepX} y={PAD_T} width={stepX} height={INNER_H} fill="transparent" />
              <rect x={x} y={y} width={bw} height={bh}
                fill={isPk ? 'var(--ember)' : (isHv ? 'var(--moss-2)' : 'var(--ink)')}
                style={{ transition: 'fill .12s' }} />

              {isPk && (
                <g>
                  <line x1={x + bw / 2} y1={y - 8} x2={x + bw / 2} y2={y - 22}
                    stroke="var(--ember)" strokeWidth="0.75" />
                  <text x={x + bw / 2} y={y - 26} textAnchor="middle"
                    fontFamily="var(--font-serif)" fontStyle="italic" fontSize="11" fill="var(--ember)">
                    peak — {d.mins}m
                  </text>
                </g>
              )}

              <text x={x + bw / 2} y={H - PAD_B + 16} textAnchor="middle"
                fontFamily="var(--font-sans)" fontSize="11" fontWeight={isHv ? 600 : 400}
                fill={isHv ? 'var(--ink)' : 'var(--muted)'}>{label(d)}</text>
              <text x={x + bw / 2} y={H - PAD_B + 28} textAnchor="middle"
                fontFamily="var(--font-mono)" fontSize="9" fill="var(--dim)">{d.plays}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ActivityRibbonSkeleton() {
  return (
    <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ height: 24, width: 180, background: 'var(--paper-2)', marginBottom: 18 }} />
      <div style={{ height: H, background: 'var(--paper-2)' }} />
    </div>
  );
}
