// SoundSage — Pattern view visualizations
// Editorial charts for the four /patterns?view=... destination pages:
//   • WeekdayWeekendChart — bar chart by weekday + summary split, interactive
//   • TimeOfDayChart      — proportion bar + four band cards, interactive
//   • SeasonalGenreGrid   — four-season genre lists, side by side
//   • MoodClustersChart   — 2D valence×energy scatter derived from genres

'use client';

import { useState } from 'react';
import { Caps, Mono } from '../primitives';
import type { GenreStat } from '../../types';

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
  // Hover state: which group ('weekday' | 'weekend') and which day index (0-6)
  // are currently hovered. Either or both can be set; clearing happens on
  // mouse-leave of the chart container.
  const [hoverGroup, setHoverGroup] = useState<null | 'weekday' | 'weekend'>(null);
  const [hoverDay, setHoverDay]     = useState<number | null>(null);

  const total = weekdayPlays + weekendPlays;
  const weekdayShare = total > 0 ? weekdayPlays / total : 0;
  const weekendShare = total > 0 ? weekendPlays / total : 0;
  const max = Math.max(...byDay.map((d) => d.plays), 1);

  const focusedDay = hoverDay != null ? byDay[hoverDay] : null;
  // A "group" is implied by either explicit group hover OR the group of the
  // currently hovered day. Used to dim the opposite half of the split bar.
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
  // The right-aligned readout reflects whatever the user is currently
  // pointing at. With no hover it summarises the overall split.
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

  // The peak band — used as default heading focus when nothing is hovered.
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
// Mood clusters
//
// We don't have Spotify audio features ingested (the API endpoint is closed
// to new apps), so we approximate each genre's mood via a regex-based
// genre→(energy, valence) lookup. Bubbles are sized by share-of-plays and
// placed on a 2D plane, with quadrant labels indicating the editorial mood
// of each region.
// ─────────────────────────────────────────────────────────────────────────────

const MOOD_QUADRANTS = [
  { id: 'bright',         label: 'Bright',        sublabel: 'high energy · warm',     x: 0.78, y: 0.16, color: 'var(--gold)'  },
  { id: 'restless',       label: 'Restless',      sublabel: 'high energy · cool',     x: 0.22, y: 0.16, color: 'var(--ember)' },
  { id: 'peaceful',       label: 'Peaceful',      sublabel: 'low energy · warm',      x: 0.78, y: 0.84, color: 'var(--moss)'  },
  { id: 'contemplative',  label: 'Contemplative', sublabel: 'low energy · cool',      x: 0.22, y: 0.84, color: 'var(--plum)'  },
] as const;

/**
 * Map a genre name to (energy, valence) on [0..1]. Energy = 0 calm, 1 intense.
 * Valence = 0 dark/cool, 1 bright/warm. Hand-tuned regex categories — adjust
 * here as the genre vocabulary evolves.
 */
function genreMood(name: string): { energy: number; valence: number } {
  const n = name.toLowerCase();
  // Bright (high energy, high valence)
  if (/\b(dance|disco|funk|salsa|samba|reggaeton|edm|electro\s?pop|happy|party|tropical|afrobeats?)\b/.test(n))
    return { energy: 0.85, valence: 0.85 };
  if (/\b(pop|k-pop|j-pop|bubblegum)\b/.test(n))
    return { energy: 0.75, valence: 0.8 };
  // Restless (high energy, low valence)
  if (/\b(metal|hardcore|punk|thrash|grindcore|black metal|death|industrial|grunge|emo|screamo)\b/.test(n))
    return { energy: 0.92, valence: 0.22 };
  if (/\b(garage rock|noise|post-punk|drum and bass|dnb|breakcore|hyperpop)\b/.test(n))
    return { energy: 0.82, valence: 0.35 };
  // Peaceful (low energy, high valence)
  if (/\b(folk|bossa|acoustic|singer-songwriter|country|americana|chamber|gospel|lounge)\b/.test(n))
    return { energy: 0.32, valence: 0.7 };
  if (/\b(jazz|smooth jazz|soul|r&b|neo-soul|bedroom pop)\b/.test(n))
    return { energy: 0.45, valence: 0.65 };
  // Contemplative (low energy, low valence)
  if (/\b(ambient|drone|new age|meditation|asmr)\b/.test(n))
    return { energy: 0.18, valence: 0.4 };
  if (/\b(classical|baroque|romantic|orchestral|piano|score|soundtrack)\b/.test(n))
    return { energy: 0.4, valence: 0.45 };
  if (/\b(lo-?fi|chillwave|chillhop|slowcore|shoegaze|dreampop|dream pop|sad)\b/.test(n))
    return { energy: 0.32, valence: 0.38 };
  if (/\bpost-rock\b/.test(n))
    return { energy: 0.55, valence: 0.4 };
  // Mid-energy mid-valence broad categories
  if (/\b(rock|alt rock|alternative|hard rock|prog)\b/.test(n))
    return { energy: 0.7, valence: 0.5 };
  if (/\bindie\b/.test(n))
    return { energy: 0.55, valence: 0.55 };
  if (/\b(electronic|techno|house|trance|synth|idm|ambient techno)\b/.test(n))
    return { energy: 0.7, valence: 0.5 };
  if (/\b(hip hop|hip-hop|rap|trap|drill|grime)\b/.test(n))
    return { energy: 0.65, valence: 0.5 };
  if (/\b(reggae|ska|dub)\b/.test(n))
    return { energy: 0.55, valence: 0.65 };
  if (/\b(blues)\b/.test(n))
    return { energy: 0.5, valence: 0.45 };
  // Default — center
  return { energy: 0.5, valence: 0.5 };
}

function quadrantOf(energy: number, valence: number): typeof MOOD_QUADRANTS[number]['id'] {
  if (energy >= 0.5 && valence >= 0.5) return 'bright';
  if (energy >= 0.5 && valence <  0.5) return 'restless';
  if (energy <  0.5 && valence >= 0.5) return 'peaceful';
  return 'contemplative';
}

interface MoodClustersProps {
  genres: GenreStat[];
}

export function MoodClustersChart({ genres }: MoodClustersProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (genres.length === 0) {
    return <MoodClustersEmpty />;
  }

  // Layout constants — matches HourlyMountain's 5:1 viewBox ratio so the
  // chart slots into the same editorial "band".
  const W = 1400, H = 560, PAD = 64;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  // Plot points: x = valence (0 left → 1 right), y = energy (0 bottom → 1 top).
  // We invert y because SVG y grows downward.
  const points = genres.map((g) => {
    const m = genreMood(g.name);
    return {
      ...g,
      energy:  m.energy,
      valence: m.valence,
      cx: PAD + m.valence * innerW,
      cy: PAD + (1 - m.energy) * innerH,
      // Bubble radius scales with share. Min 8px, max ~64px — sqrt scaling
      // so visual area is proportional to share.
      r: 8 + Math.sqrt(g.share) * 56,
      quadrant: quadrantOf(m.energy, m.valence),
    };
  });
  const maxR = Math.max(...points.map((p) => p.r), 1);

  // Counts of plays per quadrant — for the corner totals.
  const totalPlays = genres.reduce((s, g) => s + g.plays, 0);
  const quadrantTotals: Record<string, number> = {};
  for (const p of points) {
    quadrantTotals[p.quadrant] = (quadrantTotals[p.quadrant] ?? 0) + p.plays;
  }

  const focused = hover != null ? points[hover] : null;

  return (
    <section style={{ padding: '32px 28px 56px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <div>
            <Caps>Fig. 一 — Mood quadrants</Caps>
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
              {focused ? (
                <>
                  <em>{focused.name}</em>{' '}
                  <span style={{ color: 'var(--muted)' }}>·</span>{' '}
                  <Mono style={{ fontSize: 16 }}>{(focused.share * 100).toFixed(1)}%</Mono>
                  <span style={{ color: 'var(--dim)' }}>{' · '}{labelFor(focused.quadrant)}</span>
                </>
              ) : (
                <>Energy &amp; valence, by genre</>
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
            fill="var(--paper-2)" stroke="var(--rule)" strokeWidth="1"
          />
          {/* Axes — center crosshair dividing into four quadrants */}
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

          {/* Quadrant labels in the corners */}
          {MOOD_QUADRANTS.map((q) => {
            const cx = PAD + q.x * innerW;
            const cy = PAD + q.y * innerH;
            const total = quadrantTotals[q.id] ?? 0;
            const share = totalPlays > 0 ? total / totalPlays : 0;
            return (
              <g key={q.id}>
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
            fill="var(--dim)" letterSpacing="0.08em"
          >HIGH ENERGY</text>
          <text
            x={PAD - 12} y={PAD + innerH}
            textAnchor="end" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em"
          >LOW ENERGY</text>
          <text
            x={PAD} y={H - PAD + 22}
            textAnchor="start" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em"
          >COOL · LOW VALENCE</text>
          <text
            x={PAD + innerW} y={H - PAD + 22}
            textAnchor="end" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--dim)" letterSpacing="0.08em"
          >WARM · HIGH VALENCE</text>

          {/* Genre bubbles */}
          {points.map((p, i) => {
            const isHv = hover === i;
            const dim = hover != null && !isHv;
            const q = MOOD_QUADRANTS.find((qq) => qq.id === p.quadrant)!;
            return (
              <g
                key={p.name}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'default' }}
              >
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  fill={q.color}
                  fillOpacity={dim ? 0.2 : 0.55}
                  stroke={isHv ? 'var(--ink)' : q.color}
                  strokeWidth={isHv ? 2 : 1}
                  style={{ transition: 'fill-opacity 0.15s, stroke-width 0.15s' }}
                />
                {/* Show the label inside for big bubbles, beside for small */}
                {p.r > maxR * 0.5 ? (
                  <text
                    x={p.cx} y={p.cy + 4}
                    textAnchor="middle"
                    fontFamily="var(--font-serif)"
                    fontSize={Math.min(16, p.r * 0.45)}
                    fill="var(--ink)"
                    pointerEvents="none"
                    opacity={dim ? 0.4 : 1}
                  >
                    {p.name}
                  </text>
                ) : (
                  <text
                    x={p.cx + p.r + 4} y={p.cy + 3}
                    textAnchor="start"
                    fontFamily="var(--font-serif)"
                    fontSize="11"
                    fill="var(--ink)"
                    pointerEvents="none"
                    opacity={dim ? 0.35 : 0.85}
                  >
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
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
          Mood coordinates are derived from each genre's editorial profile —
          Spotify's audio-features endpoint is no longer open to new apps, so
          this view approximates valence and energy via genre rather than
          per-track signal.
        </p>
      </div>
    </section>
  );
}

function labelFor(id: string): string {
  return MOOD_QUADRANTS.find((q) => q.id === id)?.label.toLowerCase() ?? id;
}

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
          No genre signal yet.
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
          Mood quadrants are derived from the genres of artists you listen to.
          Once a few plays come in, this view will plot each genre on the
          energy × valence plane.
        </p>
      </div>
    </section>
  );
}

// Backwards-compatible export so existing imports keep working.
export const MoodClustersPlaceholder = MoodClustersEmpty;
