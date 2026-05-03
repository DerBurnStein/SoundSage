// Unit tests for lib/mood.ts — the pure mood-coordinate scoring used by
// the /patterns?view=mood-clusters destination. These tests pin down the
// genre vocabulary regressions and the trackMood blending so a stray edit
// to the regex map doesn't silently flip a genre into the wrong quadrant.

import { describe, it, expect } from 'vitest';
import {
  genreMood,
  trackMood,
  quadrantOf,
  MOOD_QUADRANTS,
  type MoodQuadrantId,
} from '@/lib/mood';

const aMin = 60_000;

// ────────────────────────────────────────────────────────────────────────────
// quadrantOf
// ────────────────────────────────────────────────────────────────────────────

describe('quadrantOf', () => {
  it('maps high energy + high valence to bright', () => {
    expect(quadrantOf(0.8, 0.8)).toBe('bright');
    expect(quadrantOf(0.5, 0.5)).toBe('bright');   // boundary → bright
  });

  it('maps high energy + low valence to restless', () => {
    expect(quadrantOf(0.9, 0.2)).toBe('restless');
    expect(quadrantOf(0.5, 0.49)).toBe('restless');
  });

  it('maps low energy + high valence to peaceful', () => {
    expect(quadrantOf(0.3, 0.7)).toBe('peaceful');
    expect(quadrantOf(0.49, 0.5)).toBe('peaceful');
  });

  it('maps low energy + low valence to contemplative', () => {
    expect(quadrantOf(0.2, 0.2)).toBe('contemplative');
    expect(quadrantOf(0.0, 0.0)).toBe('contemplative');
  });

  it('returns one of the four canonical ids for any input', () => {
    const ids = new Set<MoodQuadrantId>(MOOD_QUADRANTS.map((q) => q.id));
    for (let e = 0; e <= 1; e += 0.25) {
      for (let v = 0; v <= 1; v += 0.25) {
        expect(ids.has(quadrantOf(e, v))).toBe(true);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// genreMood
// ────────────────────────────────────────────────────────────────────────────

describe('genreMood', () => {
  it('lands "metal" in restless', () => {
    const m = genreMood('death metal');
    expect(quadrantOf(m.energy, m.valence)).toBe('restless');
  });

  it('lands "pop" in bright', () => {
    const m = genreMood('pop');
    expect(quadrantOf(m.energy, m.valence)).toBe('bright');
  });

  it('lands "ambient" in contemplative', () => {
    const m = genreMood('ambient');
    expect(quadrantOf(m.energy, m.valence)).toBe('contemplative');
  });

  it('lands "folk" in peaceful', () => {
    const m = genreMood('folk');
    expect(quadrantOf(m.energy, m.valence)).toBe('peaceful');
  });

  it('lands subgenres added to fight the bright bias', () => {
    expect(quadrantOf(...c(genreMood('trip-hop')))).toBe('contemplative');
    expect(quadrantOf(...c(genreMood('post-punk revival')))).toBe('restless');
    expect(quadrantOf(...c(genreMood('shoegaze')))).toBe('contemplative');
    expect(quadrantOf(...c(genreMood('art rock')))).toBe('contemplative');
  });

  it('keeps "indie" cooler than "indie pop"', () => {
    const indie    = genreMood('indie');
    const indiePop = genreMood('indie pop');
    expect(indie.valence).toBeLessThan(indiePop.valence);
  });

  it('treats unknown genres as slightly cool of centre', () => {
    const m = genreMood('zzzzz unknown garage flute');
    expect(m.energy).toBeLessThan(0.5);
    expect(m.valence).toBeLessThan(0.5);
  });

  it('returns coords inside [0, 1] for every match', () => {
    const samples = ['pop', 'metal', 'ambient', 'folk', 'jazz', 'indie',
      'unknown blah', 'lo-fi', 'classical', 'reggaeton', 'punk'];
    for (const g of samples) {
      const m = genreMood(g);
      expect(m.energy).toBeGreaterThanOrEqual(0);
      expect(m.energy).toBeLessThanOrEqual(1);
      expect(m.valence).toBeGreaterThanOrEqual(0);
      expect(m.valence).toBeLessThanOrEqual(1);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// trackMood
// ────────────────────────────────────────────────────────────────────────────

describe('trackMood', () => {
  it('falls back to centre-cool when no genres + no name signal', () => {
    const m = trackMood({ name: 'Untitled', durationMs: 3 * aMin, artistGenres: [] });
    // Default fallback in trackMood (genre-less) is 0.5 / 0.5; the name
    // "untitled" has no keywords so coords stay at 0.5 / 0.5 (no nudge).
    expect(m.energy).toBeCloseTo(0.5, 5);
    expect(m.valence).toBeCloseTo(0.5, 5);
  });

  it('inherits artist-genre baseline when present', () => {
    const m = trackMood({
      name: 'No keywords here',
      durationMs: 3 * aMin,
      artistGenres: ['ambient'],
    });
    // ambient → energy 0.16, valence 0.4 (no name nudges, mid duration)
    expect(m.energy).toBeLessThan(0.3);
    expect(m.valence).toBeLessThan(0.5);
    expect(quadrantOf(m.energy, m.valence)).toBe('contemplative');
  });

  it('lets a sad title pull a bright-genre track into a cooler quadrant', () => {
    // "Happy days" matches VALENCE_UP via the "happy" keyword and triggers
    // the +valence nudge; "Funeral" matches VALENCE_DOWN. Same artist genre
    // (pop), opposite name sentiments — the gap should be visible.
    const bright = trackMood({
      name: 'Happy days',
      durationMs: 3 * aMin,
      artistGenres: ['pop'],
    });
    const sad = trackMood({
      name: 'Funeral',
      durationMs: 3 * aMin,
      artistGenres: ['pop'],
    });
    expect(sad.valence).toBeLessThan(bright.valence);
    expect(bright.valence - sad.valence).toBeGreaterThan(0.2);
  });

  it('boosts energy for energetic-keyword titles', () => {
    const calm = trackMood({
      name: 'Drift slowly',
      durationMs: 3 * aMin,
      artistGenres: ['indie'],
    });
    const wild = trackMood({
      name: 'Riot fire',
      durationMs: 3 * aMin,
      artistGenres: ['indie'],
    });
    expect(wild.energy).toBeGreaterThan(calm.energy);
  });

  it('skews very short tracks higher energy / lower valence', () => {
    const normal = trackMood({
      name: 'Track',
      durationMs: 3 * aMin,
      artistGenres: ['rock'],
    });
    const short = trackMood({
      name: 'Track',
      durationMs: 1.5 * aMin,
      artistGenres: ['rock'],
    });
    expect(short.energy).toBeGreaterThan(normal.energy);
    expect(short.valence).toBeLessThan(normal.valence);
  });

  it('skews very long tracks lower energy', () => {
    const normal = trackMood({
      name: 'Track',
      durationMs: 3 * aMin,
      artistGenres: ['rock'],
    });
    const epic = trackMood({
      name: 'Track',
      durationMs: 10 * aMin,
      artistGenres: ['rock'],
    });
    expect(epic.energy).toBeLessThan(normal.energy);
  });

  it('clamps results into (0.02, 0.98)', () => {
    // Stack everything that nudges energy down.
    const ultraCalm = trackMood({
      name: 'Slow night quiet whisper drift',
      durationMs: 12 * aMin,
      artistGenres: ['ambient', 'drone', 'lo-fi'],
    });
    expect(ultraCalm.energy).toBeGreaterThanOrEqual(0.02);
    expect(ultraCalm.energy).toBeLessThanOrEqual(0.98);
    expect(ultraCalm.valence).toBeGreaterThanOrEqual(0.02);
    expect(ultraCalm.valence).toBeLessThanOrEqual(0.98);

    // Now stack everything that nudges energy up.
    const ultraHot = trackMood({
      name: 'Fire fight burn rage riot',
      durationMs: 1.4 * aMin,
      artistGenres: ['hardcore', 'metal', 'punk'],
    });
    expect(ultraHot.energy).toBeGreaterThanOrEqual(0.02);
    expect(ultraHot.energy).toBeLessThanOrEqual(0.98);
    expect(ultraHot.valence).toBeGreaterThanOrEqual(0.02);
    expect(ultraHot.valence).toBeLessThanOrEqual(0.98);
  });

  it('averages across multiple artist genres', () => {
    const a = trackMood({ name: 'Track', durationMs: 3 * aMin, artistGenres: ['ambient'] });
    const b = trackMood({ name: 'Track', durationMs: 3 * aMin, artistGenres: ['pop'] });
    const both = trackMood({
      name: 'Track', durationMs: 3 * aMin, artistGenres: ['ambient', 'pop'],
    });
    // Mean should sit between the two singletons (fuzzy — the duration +
    // name layers can shift things, but for "Track" + 3min they don't).
    expect(both.energy).toBeGreaterThan(a.energy);
    expect(both.energy).toBeLessThan(b.energy);
  });
});

/** spread helper so the assertion lines stay short. */
function c(m: { energy: number; valence: number }): [number, number] {
  return [m.energy, m.valence];
}
