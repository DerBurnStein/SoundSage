// SoundSage — HourlyClock
// Radial 24-segment clock showing play density by hour of day.
// Props-driven: feed it HourlyBucket[24] from /api/stats/hourly.

'use client';

import { useState } from 'react';
import { Caps, hourLabel } from '../primitives';
import type { HourlyBucket } from '../../types';

interface HourlyClockProps {
  data:     HourlyBucket[];  // exactly 24 elements
  loading?: boolean;
}

const SIZE   = 280;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R_OUT  = 120;
const R_IN   = 40;
const SLICE  = (2 * Math.PI) / 24;

export function HourlyClock({ data, loading }: HourlyClockProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (loading || !data.length) {
    return (
      <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ height: SIZE, width: SIZE, background: 'var(--paper-2)', borderRadius: '50%', margin: '0 auto' }} />
      </div>
    );
  }

  const max     = Math.max(...data.map(d => d.plays));
  const peakHr  = data.reduce((a, b) => b.plays > a.plays ? b : a, data[0]).hour;

  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ marginBottom: 12 }}>
        <Caps>Fig. 二 — By hour of day</Caps>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          A <em>night-owl</em> profile
        </h3>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: SIZE, margin: '0 auto' }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%">
          {/* Clock face rings */}
          <circle cx={CX} cy={CY} r={R_OUT + 12} fill="none" stroke="var(--rule)" strokeOpacity="0.3" />
          <circle cx={CX} cy={CY} r={R_IN}        fill="var(--paper-2)" stroke="var(--rule)" strokeOpacity="0.4" />

          {/* 24 wedges */}
          {data.map(({ hour: h, plays: v }) => {
            const a0 = -Math.PI / 2 + h * SLICE;
            const a1 = a0 + SLICE;
            const r  = R_IN + (R_OUT - R_IN) * (v / max);
            const x0 = CX + Math.cos(a0) * R_IN;
            const y0 = CY + Math.sin(a0) * R_IN;
            const x1 = CX + Math.cos(a0) * r;
            const y1 = CY + Math.sin(a0) * r;
            const x2 = CX + Math.cos(a1) * r;
            const y2 = CY + Math.sin(a1) * r;
            const x3 = CX + Math.cos(a1) * R_IN;
            const y3 = CY + Math.sin(a1) * R_IN;
            const d  = `M ${x0} ${y0} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${R_IN} ${R_IN} 0 0 0 ${x0} ${y0} Z`;
            const isPk = h === peakHr;
            const isHv = hover === h;

            return (
              <path key={h} d={d}
                fill={isPk ? 'var(--ember)' : (isHv ? 'var(--moss-2)' : 'var(--ink)')}
                stroke="var(--paper)" strokeWidth="1"
                onMouseEnter={() => setHover(h)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer', transition: 'fill .12s' }}
              />
            );
          })}

          {/* Cardinal labels */}
          {[0, 6, 12, 18].map(h => {
            const a = -Math.PI / 2 + h * SLICE;
            const r = R_OUT + 22;
            return (
              <text key={h}
                x={CX + Math.cos(a) * r} y={CY + Math.sin(a) * r + 4}
                textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--muted)">
                {hourLabel(h)}
              </text>
            );
          })}

          {/* Centre readout */}
          <text x={CX} y={CY - 4} textAnchor="middle"
            fontFamily="var(--font-serif)" fontSize="20" fontWeight="500" fill="var(--ink)">
            {hover != null ? data[hover]?.plays : max}
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle"
            fontFamily="var(--font-mono)" fontSize="9" fill="var(--muted)" letterSpacing="0.1em">
            {hover != null ? hourLabel(hover).toUpperCase() : `PEAK · ${hourLabel(peakHr).toUpperCase()}`}
          </text>
        </svg>
      </div>
    </div>
  );
}
