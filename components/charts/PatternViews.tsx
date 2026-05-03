// SoundSage — Pattern view visualizations
// Editorial charts for the four /patterns?view=... destination pages:
//   • WeekdayWeekendChart  — bar chart by weekday + summary split, interactive
//   • TimeOfDayChart       — proportion bar + four band cards, interactive
//   • SeasonalGenreGrid    — four-season genre lists, side by side
//   • MoodProfile          — share-of-plays per mood quadrant
//   • MoodCloudChart       — per-track scatter on the energy × valence plane
//   • TrackQuadrantBreakdown — top tracks per quadrant (textual companion)

'use client';

import { useMemo, useState } from 'react';
import { Caps, Mono, Display, pad2, cleanTrackName } from '../primitives';
import type { GenreStat } from '../../types';
import type { MoodPoint } from '@/lib/page-data';
import { MOOD_QUADRANTS, type MoodQuadrantId } from '@/lib/mood';

const TRANSITION = '500ms cubic-bezier(0.22, 1, 0.36, 1)';

// ─────────────────────────────────────────────────────────────────────────────
// Weekday vs weekend
// ─────────────────────────────────────────────────────────────────────────────

interface WeekdayWeekendProps {
  weekdayPlays:   number;
  weekendPlays:   number;
  weekdayMinsAvg: number;
  weekendMinsAvg: number;
  byDay: { day: number; plays: number; mins: number }[];
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekdayWeekendChart({
  weekdayPlays,
  weekendPlays,
  weekdayMinsAvg,
  weekendMinsAvg,
  byDay,
}: WeekdayWeekendProps) {
  const [hoverGroup, setHoverGroup] = useState<null | 'weekday' | 'weekend'>(null);
  const [hoverDay, setHoverDay]     = useState<number | null>(null);

  const total = weekdayPlays + weekendPlays;
  const weekdayShare = total > 0 ? weekdayPlays / total : 0;
  const weekendShare = total > 0 ? weekendPlays / total : 0;
  const max = Math.max(...byDay.map((d) => d.plays), 1);

  const focusedDay = hoverDay != null ? byDay[hoverDay] : null;
  const activeGroup: 'weekday' | 'weekend' | null = hoverGroup
    ?? (hoverDay != null ? (hoverDay >= 5 ? 'weekend' : 'weekday') : null);

  return (
    <section
      style={{ padding: '32px 28px 48px', borderBottom: '1px solid var(--rule)' }}
      onMouseLeave={() => { setHoverGroup(null); setHoverDay(null); }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <Caps>Fig. 一 — Days of the week</Caps>
          <FocusReadout day={focusedDay} weekdayPlays={weekdayPlays} weekendPlays={weekendPlays} />
        </div>

        {/* Split summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${weekdayShare * 100}fr ${weekendShare * 100}fr`,
            border: '1px solid var(--rule)',
            marginTop: 4,
            marginBottom: 32,
            minHeight: 84,
          }}
        >
          <SplitCell
            label="Weekdays"
            plays={weekdayPlays}
            share={weekdayShare}
            avgMins={weekdayMinsAvg}
            color="var(--ink)"
            textColor="var(--paper)"
            dim={activeGroup === 'weekend'}
            onMouseEnter={() => setHoverGroup('weekday')}
            onMouseLeave={() => setHoverGroup(null)}
          />
          <SplitCell
            label="Weekend"
            plays={weekendPlays}
            share={weekendShare}
            avgMins={weekendMinsAvg}
            color="var(--ember)"
            textColor="var(--paper)"
            borderLeft
            dim={activeGroup === 'weekday'}
            onMouseEnter={() => setHoverGroup('weekend')}
            onMouseLeave={() => setHoverGroup(null)}
          />
        </div>

        {/* Per-day bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
          {byDay.map((d) => {
            const pct = (d.plays / max) * 100;
            const isWeekend = d.day >= 5;
            const isHovered = hoverDay === d.day;
            const groupDimmed = activeGroup != null
              && ((activeGroup === 'weekday' && isWeekend)
               || (activeGroup === 'weekend' && !isWeekend));
            const dim = (hoverDay != null && !isHovered) || groupDimmed;
            return (
              <div
                key={d.day}
                onMouseEnter={() => setHoverDay(d.day)}
                onMouseLeave={() => setHoverDay(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 8,
                  cursor: 'default',
                  opacity: dim ? 0.45 : 1,
                  transition: `opacity 0.15s`,
                }}
              >
                <div
                  style={{
                    height: 160,
                    border: `1px solid ${isHovered ? 'var(--ink)' : 'var(--rule)'}`,
                    position: 'relative',
                    background: 'var(--paper-2)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0, right: 0, bottom: 0,
                      height: `${pct}%`,
                      background: isWeekend ? 'var(--ember)' : 'var(--ink)',
                      transition: `height ${TRANSITION}`,
                    }}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 14,
                      fontWeight: isHovered ? 600 : 500,
                      color: 'var(--ink)',
                    }}
                  >
                    {DOW_LABELS[d.day]}
                  </div>
                  <Mono style={{ fontSize: 10, color: 'var(--dim)', display: 'block', marginTop: 2 }}>
                    {d.plays.toLocaleString()} plays
                  </Mono>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FocusReadout({
  day, weekdayPlays, weekendPlays,
}: {
  day: { day: number; plays: number; mins: number } | null;
  weekdayPlays: number;
  weekendPlays: number;
}) {
  if (!day) {
    return (
      <Mono style={{ fontSize: 11, color: 'var(--dim)' }}>
        weekdays · weekend
      </Mono>
    );
  }
  const isWeekend = day.day >= 5;
  const groupTotal = isWeekend ? weekendPlays : weekdayPlays;
  const shareOfGroup = groupTotal > 0 ? day.plays / groupTotal : 0;
  return (
    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink)' }}>
      <em>{DOW_LABELS[day.day]}</em>{' · '}
      <Mono style={{ fontSize: 13 }}>{day.plays.toLocaleString()}</Mono>{' plays · '}
      <Mono style={{ fontSize: 13 }}>{(shareOfGroup * 100).toFixed(1)}%</Mono>{' of '}
      {isWeekend ? 'weekend' : 'weekday'} plays
    </span>
  );
}

function SplitCell({
  label, plays, share, avgMins, color, textColor, borderLeft = false, dim = false,
  onMouseEnter, onMouseLeave,
}: {
  label:     string;
  plays:     number;
  share:     number;
  avgMins:   number;
  color:     string;
  textColor: string;
  borderLeft?: boolean;
  dim?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: color, color: textColor,
        padding: '18px 20px',
        borderLeft: borderLeft ? '1px solid var(--paper)' : 'none',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: 'default',
        opacity: dim ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500 }}>
          {label}
        </span>
        <Mono style={{ fontSize: 18, fontWeight: 500 }}>
          {(share * 100).toFixed(1)}%
        </Mono>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <Mono style={{ fontSize: 11, opacity: 0.85 }}>
          {plays.toLocaleString()} plays
        </Mono>
        <Mono style={{ fontSize: 11, opacity: 0.85 }}>
          ~{avgMins}m / day
        </Mono>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-of-day donut + bars
// ─────────────────────────────────────────────────────────────────────────────

interface TimeOfDayProps {
  morning: number;
  midday:  number;
  evening: number;
  night:   number;
  total:   number;
}

type TodKey = 'morning' | 'midday' | 'evening' | 'night';

const TOD_BANDS: { key: TodKey; label: string; hours: string; kanji: string; color: string }[] = [
  { key: 'morning', label: 'Morning',  hours: '5 — 11',  kanji: '朝', color: 'var(--gold)'  },
  { key: 'midday',  label: 'Midday',   hours: '11 — 17', kanji: '昼', color: 'var(--ember)' },
  { key: 'evening', label: 'Evening',  hours: '17 — 22', kanji: '夕', color: 'var(--plum)'  },
  { key: 'night',   label: 'Night',    hours: '22 — 5',  kanji: '夜', color: 'var(--ink)'   },
];

export function TimeOfDayChart({ morning, midday, evening, night, total }: TimeOfDayProps) {
  const [hover, setHover] = useState<TodKey | null>(null);
  const counts: Record<TodKey, number> = { morning, midday, evening, night };
  const max = Math.max(morning, midday, evening, night, 1);
  const focused = hover ? TOD_BANDS.find((b) => b.key === hover)! : null;
  const focusedCount = focused ? counts[focused.key] : 0;
  const focusedShare = total > 0 && focused ? focusedCount / total : 0;

  const peakKey: TodKey = (TOD_BANDS.reduce((a, b) =>
    counts[a.key] >= counts[b.key] ? a : b
  )).key;
  const peakBand = TOD_BANDS.find((b) => b.key === peakKey)!;

  return (
    <section
      style={{ padding: '32px 28px 48px', borderBottom: '1px solid var(--rule)' }}
      onMouseLeave={() => setHover(null)}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Caps>Fig. 一 — Hours of the day</Caps>
        <h3
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 24,
            marginTop: 8,
            marginBottom: 28,
            letterSpacing: '-0.01em',
            minHeight: '1.4em',
          }}
        >
          {focused ? (
            <>
              <em style={{ color: focused.color }}>{focused.label}</em>{' '}
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mincho)', fontStyle: 'italic' }}>·</span>{' '}
              <Mono style={{ fontSize: 18 }}>{focusedCount.toLocaleString()}</Mono>{' plays'}
              <span style={{ color: 'var(--dim)' }}>{' · '}{(focusedShare * 100).toFixed(1)}% of period</span>
            </>
          ) : (
            <>
              When does the music play? <em style={{ color: peakBand.color }}>{peakBand.label.toLowerCase()}</em>
              <span style={{ color: 'var(--muted)' }}>{' '}leads.</span>
            </>
          )}
        </h3>

        {/* Stacked horizontal proportion bar */}
        <div
          style={{
            display: 'flex',
            height: 22,
            border: '1px solid var(--rule)',
            marginBottom: 28,
          }}
        >
          {TOD_BANDS.map((b) => {
            const share = total > 0 ? counts[b.key] / total : 0;
            const isHv = hover === b.key;
            return (
              <div
                key={b.key}
                onMouseEnter={() => setHover(b.key)}
                onMouseLeave={() => setHover(null)}
                style={{
                  width: `${share * 100}%`,
                  background: b.color,
                  borderRight: '1px solid var(--paper)',
                  cursor: 'default',
                  outline: isHv ? '2px solid var(--ink)' : 'none',
                  outlineOffset: isHv ? -2 : 0,
                  opacity: hover == null || isHv ? 1 : 0.55,
                  transition: `width ${TRANSITION}, opacity 0.15s, outline 0.15s`,
                }}
                title={`${b.label}: ${(share * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>

        {/* Four band cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {TOD_BANDS.map((b) => {
            const c = counts[b.key];
            const share = total > 0 ? c / total : 0;
            const barPct = (c / max) * 100;
            const isHv = hover === b.key;
            return (
              <div
                key={b.key}
                onMouseEnter={() => setHover(b.key)}
                onMouseLeave={() => setHover(null)}
                style={{
                  border: `1px solid ${isHv ? 'var(--ink)' : 'var(--rule)'}`,
                  padding: '20px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  background: 'var(--paper)',
                  cursor: 'default',
                  opacity: hover == null || isHv ? 1 : 0.55,
                  transition: 'opacity 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mincho)',
                      fontSize: 36,
                      fontWeight: 500,
                      color: b.color,
                      lineHeight: 1,
                    }}
                  >
                    {b.kanji}
                  </span>
                  <Mono style={{ fontSize: 11, color: 'var(--dim)' }}>{b.hours}</Mono>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 18,
                    color: 'var(--ink)',
                    fontWeight: isHv ? 600 : 400,
                  }}
                >
                  {b.label}
                </div>
                <div style={{ height: 4, background: 'var(--paper-3)', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0, top: 0, bottom: 0,
                      width: `${barPct}%`,
                      background: b.color,
                      transition: `width ${TRANSITION}`,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Mono style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                    {c.toLocaleString()}
                  </Mono>
                  <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {(share * 100).toFixed(1)}%
                  </Mono>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seasonal genres
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonalGenresProps {
  seasons: { name: 'winter' | 'spring' | 'summer' | 'autumn'; genres: GenreStat[] }[];
}

const SEASON_META: Record<string, { kanji: string; label: string; color: string }> = {
  winter: { kanji: '冬', label: 'Winter', color: 'var(--sky)' },
  spring: { kanji: '春', label: 'Spring', color: 'var(--ember)' },
  summer: { kanji: '夏', label: 'Summer', color: 'var(--gold)' },
  autumn: { kanji: '秋', label: 'Autumn', color: 'var(--plum)' },
};

export function SeasonalGenreGrid({ seasons }: SeasonalGenresProps) {
  return (
    <section style={{ padding: '32px 28px 48px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Caps>Fig. 一 — Genre by season</Caps>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginTop: 24,
          }}
        >
          {seasons.map((s) => {
            const meta = SEASON_META[s.name]!;
            const max = Math.max(...s.genres.map((g) => g.plays), 1);
            return (
              <div
                key={s.name}
                style={{
                  border: '1px solid var(--rule)',
                  padding: '18px 20px 22px',
                  background: 'var(--paper)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mincho)',
                      fontSize: 28,
                      color: meta.color,
                      lineHeight: 1,
                    }}
                  >
                    {meta.kanji}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 18,
                      color: 'var(--ink)',
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                {s.genres.length === 0 && (
                  <Mono style={{ fontSize: 11, color: 'var(--dim)' }}>No data yet</Mono>
                )}
                {s.genres.map((g) => {
                  const pct = (g.plays / max) * 100;
                  return (
                    <div key={g.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink)' }}>
                          {g.name}
                        </span>
                        <Mono style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {(g.share * 100).toFixed(0)}%
                        </Mono>
                      </div>
                      <div style={{ height: 2, background: 'var(--paper-3)', marginTop: 4, position: 'relative' }}>
                        <div
                          style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${pct}%`,
                            background: meta.color,
                            transition: `width ${TRANSITION}`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mood clusters — track-level scatter
//
// Each track gets an (energy, valence) score from lib/mood.ts which blends
// artist genres + track-name keyword sentiment + duration. The cloud chart
// plots every track as a small dot — labels live in a hover tooltip rather
// than baked onto the chart, so nothing collides visually. The breakdown
// panel below lists the top tracks per quadrant for textual reading.
// ─────────────────────────────────────────────────────────────────────────────

const QUADRANT_BY_ID: Record<MoodQuadrantId, typeof MOOD_QUADRANTS[number]> =
  Object.fromEntries(MOOD_QUADRANTS.map((q) => [q.id, q])) as Record<MoodQuadrantId, typeof MOOD_QUADRANTS[number]>;

function labelFor(id: MoodQuadrantId): string {
  return QUADRANT_BY_ID[id]?.label.toLowerCase() ?? id;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Stable string hash so each track gets the same jitter every render. */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── MoodProfile — share of plays per quadrant ───────────────────────────────

interface MoodProfileProps {
  points: MoodPoint[];
}

export function MoodProfile({ points }: MoodProfileProps) {
  const [hover, setHover] = useState<MoodQuadrantId | null>(null);

  const totals: Record<MoodQuadrantId, number> = useMemo(() => {
    const t: Record<MoodQuadrantId, number> = { bright: 0, restless: 0, peaceful: 0, contemplative: 0 };
    for (const p of points) t[p.quadrant] += p.plays;
    return t;
  }, [points]);

  if (points.length === 0) return null;
  const totalPlays = totals.bright + totals.restless + totals.peaceful + totals.contemplative;
  if (totalPlays === 0) return null;

  const dominantId = (Object.entries(totals) as [MoodQuadrantId, number][])
    .sort((a, b) => b[1] - a[1])[0]![0];
  const dominant = QUADRANT_BY_ID[dominantId];
  const focused  = hover ? QUADRANT_BY_ID[hover] : null;

  return (
    <section
      style={{ padding: '32px 28px 28px', borderBottom: '1px solid var(--rule)' }}
      onMouseLeave={() => setHover(null)}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Caps>Fig. 一 — Mood profile</Caps>
        <h3
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 24,
            marginTop: 8,
            marginBottom: 22,
            letterSpacing: '-0.01em',
            minHeight: '1.4em',
          }}
        >
          {focused ? (
            <>
              <em style={{ color: focused.color }}>{focused.label}</em>{' '}
              <span style={{ color: 'var(--muted)' }}>·</span>{' '}
              <Mono style={{ fontSize: 16 }}>
                {((totals[focused.id] / totalPlays) * 100).toFixed(1)}%
              </Mono>
              <span style={{ color: 'var(--dim)' }}>
                {' · '}{focused.sublabel}
              </span>
            </>
          ) : (
            <>
              Mostly <em style={{ color: dominant.color }}>{dominant.label.toLowerCase()}</em>
              <span style={{ color: 'var(--muted)' }}>{' · '}</span>
              <Mono style={{ fontSize: 16 }}>
                {((totals[dominantId] / totalPlays) * 100).toFixed(0)}%
              </Mono>
              <span style={{ color: 'var(--dim)' }}>{' of plays'}</span>
            </>
          )}
        </h3>

        <div style={{ display: 'flex', height: 22, border: '1px solid var(--rule)', marginBottom: 14 }}>
          {MOOD_QUADRANTS.map((q) => {
            const share = totals[q.id] / totalPlays;
            const isHv = hover === q.id;
            return (
              <div
                key={q.id}
                onMouseEnter={() => setHover(q.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  width: `${share * 100}%`,
                  background: q.color,
                  borderRight: '1px solid var(--paper)',
                  cursor: 'default',
                  outline: isHv ? '2px solid var(--ink)' : 'none',
                  outlineOffset: isHv ? -2 : 0,
                  opacity: hover == null || isHv ? 1 : 0.55,
                  transition: `width ${TRANSITION}, opacity 0.15s, outline 0.15s`,
                }}
                title={`${q.label}: ${(share * 100).toFixed(1)}%`}
              />
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 12 }}>
          {MOOD_QUADRANTS.map((q) => {
            const share = totals[q.id] / totalPlays;
            const isHv  = hover === q.id;
            return (
              <div
                key={q.id}
                onMouseEnter={() => setHover(q.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  paddingBottom: 6,
                  borderBottom: '1px dotted var(--rule)',
                  opacity: hover == null || isHv ? 1 : 0.55,
                  transition: 'opacity 0.15s',
                }}
              >
                <span style={{ width: 10, height: 10, background: q.color, display: 'inline-block', flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 15,
                    color: 'var(--ink)',
                    flex: 1,
                    fontWeight: isHv ? 600 : 400,
                  }}
                >
                  {q.label}
                </span>
                <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {(share * 100).toFixed(0)}%
                </Mono>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── MoodCloudChart — per-track scatter, no inline labels ─────────────────────

interface MoodCloudProps {
  points: MoodPoint[];
}

export function MoodCloudChart({ points }: MoodCloudProps) {
  const [hover, setHover] = useState<number | null>(null);

  // Stable jitter per track (deterministic by id) so coincident tracks fan
  // out into a small visual cluster instead of stacking on a single pixel.
  const jittered = useMemo(() => {
    return points.map((p) => {
      const h  = stableHash(p.id);
      const jx = (((h        & 0xff) / 255) - 0.5) * 0.06; // ±0.03
      const jy = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.06;
      return {
        ...p,
        valenceJ: clamp(p.valence + jx, 0.03, 0.97),
        energyJ:  clamp(p.energy  + jy, 0.03, 0.97),
      };
    });
  }, [points]);

  if (points.length === 0) return <MoodClustersEmpty />;

  // Layout — same 5:1 footprint as HourlyMountain so the band reads consistently.
  const W = 1400, H = 600, PAD = 64;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const maxPlays = Math.max(...points.map((p) => p.plays), 1);

  // Quadrant totals for the corner readouts.
  const totalPlays = points.reduce((s, p) => s + p.plays, 0);
  const quadrantTotals: Record<MoodQuadrantId, number> = {
    bright: 0, restless: 0, peaceful: 0, contemplative: 0,
  };
  for (const p of points) quadrantTotals[p.quadrant] += p.plays;

  const focused = hover != null ? jittered[hover] : null;
  const focusedQ = focused ? QUADRANT_BY_ID[focused.quadrant] : null;

  // Tooltip placement — keep inside the chart bounds.
  let tipX = 0, tipY = 0, tipAnchor: 'start' | 'end' = 'start';
  if (focused) {
    const cx = PAD + focused.valenceJ * innerW;
    const cy = PAD + (1 - focused.energyJ) * innerH;
    const onRightHalf = focused.valenceJ > 0.55;
    tipAnchor = onRightHalf ? 'end' : 'start';
    tipX = onRightHalf ? cx - 14 : cx + 14;
    tipY = cy - 12;
  }

  return (
    <section style={{ padding: '32px 28px 56px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <div>
            <Caps>Fig. 二 — Track mood cloud</Caps>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                fontSize: 24,
                marginTop: 8,
                letterSpacing: '-0.01em',
                minHeight: '1.4em',
              }}
            >
              {focused && focusedQ ? (
                <>
                  <em>{cleanTrackName(focused.name)}</em>{' '}
                  <span style={{ color: 'var(--muted)' }}>·</span>{' '}
                  <Mono style={{ fontSize: 16 }}>{focused.plays.toLocaleString()} plays</Mono>
                  <span style={{ color: focusedQ.color }}>{' · '}{labelFor(focused.quadrant)}</span>
                </>
              ) : (
                <>
                  {points.length.toLocaleString()} tracks across the energy &amp; valence plane
                </>
              )}
            </h3>
          </div>
          <Mono style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.1em' }}>
            energy · valence
          </Mono>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Outer frame */}
          <rect
            x={PAD} y={PAD} width={innerW} height={innerH}
            fill="var(--paper-2)" stroke="var(--rule)" strokeWidth={1}
          />
          {/* Crosshair through the chart's centre — divides quadrants. */}
          <line
            x1={PAD + innerW / 2} x2={PAD + innerW / 2}
            y1={PAD} y2={PAD + innerH}
            stroke="var(--rule)" strokeOpacity={0.3} strokeDasharray="3 5"
          />
          <line
            x1={PAD} x2={PAD + innerW}
            y1={PAD + innerH / 2} y2={PAD + innerH / 2}
            stroke="var(--rule)" strokeOpacity={0.3} strokeDasharray="3 5"
          />

          {/* Quadrant labels in the corners. Subtle so they don't compete
              with the dot cloud, but always present for orientation. */}
          {MOOD_QUADRANTS.map((q) => {
            const cx = PAD + q.x * innerW;
            const cy = PAD + q.y * innerH;
            const total = quadrantTotals[q.id];
            const share = totalPlays > 0 ? total / totalPlays : 0;
            return (
              <g key={q.id} pointerEvents="none">
                <text
                  x={cx} y={cy - 14}
                  textAnchor="middle"
                  fontFamily="var(--font-serif)"
                  fontStyle="italic"
                  fontSize="22"
                  fill={q.color}
                  opacity={0.85}
                >
                  {q.label}
                </text>
                <text
                  x={cx} y={cy + 8}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                  fill="var(--dim)"
                  letterSpacing="0.08em"
                >
                  {q.sublabel.toUpperCase()}
                </text>
                <text
                  x={cx} y={cy + 26}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {(share * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Axis annotations */}
          <text
            x={PAD - 12} y={PAD + 8}
            textAnchor="end" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em" pointerEvents="none"
          >HIGH ENERGY</text>
          <text
            x={PAD - 12} y={PAD + innerH}
            textAnchor="end" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em" pointerEvents="none"
          >LOW ENERGY</text>
          <text
            x={PAD} y={H - PAD + 22}
            textAnchor="start" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em" pointerEvents="none"
          >COOL · LOW VALENCE</text>
          <text
            x={PAD + innerW} y={H - PAD + 22}
            textAnchor="end" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em" pointerEvents="none"
          >WARM · HIGH VALENCE</text>

          {/* Track dots */}
          {jittered.map((p, i) => {
            const cx = PAD + p.valenceJ * innerW;
            const cy = PAD + (1 - p.energyJ) * innerH;
            // Radius scales sublinearly with plays so a runaway top track
            // doesn't dominate the cloud.
            const r  = 3 + Math.sqrt(p.plays / maxPlays) * 9;
            const isHv = hover === i;
            const dim  = hover != null && !isHv;
            const q = QUADRANT_BY_ID[p.quadrant];
            return (
              <circle
                key={p.id}
                cx={cx}
                cy={cy}
                r={isHv ? r + 2 : r}
                fill={q.color}
                fillOpacity={dim ? 0.10 : 0.55}
                stroke={isHv ? 'var(--ink)' : 'transparent'}
                strokeWidth={isHv ? 1.5 : 0}
                onMouseEnter={() => setHover(i)}
                style={{
                  cursor: 'default',
                  transition: 'fill-opacity 0.12s, stroke-width 0.12s, r 0.12s',
                }}
              />
            );
          })}

          {/* Hover tooltip card — single card, never overlaps with itself. */}
          {focused && focusedQ && (
            <g pointerEvents="none">
              <rect
                x={tipAnchor === 'end' ? tipX - 280 : tipX}
                y={tipY - 56}
                width={280}
                height={66}
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth={1}
              />
              <text
                x={tipAnchor === 'end' ? tipX - 268 : tipX + 12}
                y={tipY - 36}
                fontFamily="var(--font-serif)"
                fontSize="14"
                fontWeight="500"
                fill="var(--ink)"
              >
                {truncate(cleanTrackName(focused.name), 36)}
              </text>
              <text
                x={tipAnchor === 'end' ? tipX - 268 : tipX + 12}
                y={tipY - 20}
                fontFamily="var(--font-mincho)"
                fontStyle="italic"
                fontSize="12"
                fill="var(--muted)"
              >
                {truncate(focused.artist, 36)}
              </text>
              <text
                x={tipAnchor === 'end' ? tipX - 268 : tipX + 12}
                y={tipY - 4}
                fontFamily="var(--font-mono)"
                fontSize="10"
                fill={focusedQ.color}
                letterSpacing="0.06em"
              >
                {focused.plays} PLAYS · {focusedQ.label.toUpperCase()}
              </text>
            </g>
          )}
        </svg>

        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--dim)',
            marginTop: 16,
            lineHeight: 1.5,
          }}
        >
          Mood coordinates approximate energy and valence per track by blending
          the artist's genres with the track-name sentiment and the track's
          duration — Spotify's audio-features endpoint is no longer open to
          new apps, so this view is a structured proxy rather than a per-track
          signal.
        </p>
      </div>
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ─── TrackQuadrantBreakdown — top tracks per quadrant ─────────────────────────

interface TrackQuadrantBreakdownProps {
  points: MoodPoint[];
}

export function TrackQuadrantBreakdown({ points }: TrackQuadrantBreakdownProps) {
  // Hooks must run unconditionally — compute bucketed before the early
  // return so the hooks order stays stable across renders.
  const bucketed: Record<MoodQuadrantId, MoodPoint[]> = useMemo(() => {
    const b: Record<MoodQuadrantId, MoodPoint[]> = {
      bright: [], restless: [], peaceful: [], contemplative: [],
    };
    for (const p of points) b[p.quadrant].push(p);
    for (const id of Object.keys(b) as MoodQuadrantId[]) {
      b[id].sort((a, b2) => b2.plays - a.plays);
    }
    return b;
  }, [points]);

  if (points.length === 0) return null;

  return (
    <section style={{ padding: '32px 28px 56px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Caps>Fig. 三 — Top tracks by quadrant</Caps>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginTop: 24,
          }}
        >
          {MOOD_QUADRANTS.map((q) => {
            const items = bucketed[q.id];
            const total = items.length;
            const top = items.slice(0, 6);
            return (
              <div
                key={q.id}
                style={{
                  border: '1px solid var(--rule)',
                  padding: '18px 20px 20px',
                  background: 'var(--paper)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 20,
                      color: q.color,
                    }}
                  >
                    {q.label}
                  </span>
                  <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {total} {total === 1 ? 'track' : 'tracks'}
                  </Mono>
                </div>
                <Mono
                  style={{
                    fontSize: 9,
                    color: 'var(--dim)',
                    letterSpacing: '0.08em',
                    marginBottom: 14,
                    display: 'block',
                  }}
                >
                  {q.sublabel.toUpperCase()}
                </Mono>

                {top.length === 0 ? (
                  <Mono style={{ fontSize: 11, color: 'var(--dim)' }}>— no tracks —</Mono>
                ) : (
                  top.map((t, i) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 1fr auto',
                        alignItems: 'baseline',
                        gap: 10,
                        padding: '8px 0',
                        borderBottom: i === top.length - 1 ? 'none' : '1px dotted var(--rule)',
                      }}
                    >
                      <Display
                        size={14}
                        weight={400}
                        style={{ color: i === 0 ? q.color : 'var(--dim)', lineHeight: 1 }}
                      >
                        {pad2(i + 1)}
                      </Display>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 13,
                            color: 'var(--ink)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {cleanTrackName(t.name)}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mincho)',
                            fontStyle: 'italic',
                            fontSize: 11,
                            color: 'var(--muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {t.artist}
                        </div>
                      </div>
                      <Mono style={{ fontSize: 11, color: 'var(--ink)', flexShrink: 0 }}>
                        {t.plays}
                      </Mono>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function MoodClustersEmpty() {
  return (
    <section style={{ padding: '64px 28px 88px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-mincho)',
            fontSize: 88,
            color: 'var(--seal)',
            display: 'block',
            lineHeight: 1,
            marginBottom: 24,
          }}
        >
          韻
        </span>
        <h3
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            marginBottom: 12,
          }}
        >
          Not enough plays yet.
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 16,
            color: 'var(--muted)',
            lineHeight: 1.55,
          }}
        >
          Once a few tracks have been logged this view will plot each one on
          the energy × valence plane, with quadrant labels for orientation.
        </p>
      </div>
    </section>
  );
}

// Backwards-compatible exports so older imports keep working.
export const MoodClustersPlaceholder = MoodClustersEmpty;
export { MoodCloudChart as MoodClustersChart };
export { TrackQuadrantBreakdown as MoodQuadrantBreakdown };
