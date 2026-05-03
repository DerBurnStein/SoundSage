// Shared mood-coordinate logic — used both server-side (lib/page-data.ts
// builds mood points from track + artist data) and client-side (the
// /patterns?view=mood-clusters destination renders the scatter).
//
// Spotify's audio-features endpoint is no longer open to new apps, so we
// approximate (energy, valence) at the track level by blending three
// signals: artist genres (broad baseline), track-name keywords (sentiment
// nudge), and duration (very short → punky energy, very long → ambient).

export type MoodQuadrantId =
  | 'bright'        // high energy, high valence
  | 'restless'      // high energy, low valence
  | 'peaceful'      // low energy, high valence
  | 'contemplative' // low energy, low valence

export interface MoodCoord {
  /** 0..1 — calm to intense */
  energy:  number;
  /** 0..1 — cool/sad to warm/uplifting */
  valence: number;
}

export const MOOD_QUADRANTS: {
  id: MoodQuadrantId;
  label: string;
  sublabel: string;
  /** Fractional position used by the scatter for the corner labels */
  x: number;
  y: number;
  /** CSS variable referencing the per-tab accent for that quadrant */
  color: string;
}[] = [
  { id: 'bright',        label: 'Bright',        sublabel: 'high energy · warm', x: 0.78, y: 0.16, color: 'var(--gold)'  },
  { id: 'restless',      label: 'Restless',      sublabel: 'high energy · cool', x: 0.22, y: 0.16, color: 'var(--ember)' },
  { id: 'peaceful',      label: 'Peaceful',      sublabel: 'low energy · warm',  x: 0.78, y: 0.84, color: 'var(--moss)'  },
  { id: 'contemplative', label: 'Contemplative', sublabel: 'low energy · cool',  x: 0.22, y: 0.84, color: 'var(--plum)'  },
];

export function quadrantOf(energy: number, valence: number): MoodQuadrantId {
  if (energy >= 0.5 && valence >= 0.5) return 'bright';
  if (energy >= 0.5 && valence <  0.5) return 'restless';
  if (energy <  0.5 && valence >= 0.5) return 'peaceful';
  return 'contemplative';
}

// ─── Genre → mood (broad baseline) ───────────────────────────────────────────

export function genreMood(name: string): MoodCoord {
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
  // Mid-energy, mid-valence broad categories
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
  if (/\bblues\b/.test(n))
    return { energy: 0.5, valence: 0.45 };
  // Default — center
  return { energy: 0.5, valence: 0.5 };
}

// ─── Track-level mood ────────────────────────────────────────────────────────
//
// Blends three signals:
//   1. Artist-genre baseline (averaged across all of the track's artists)
//   2. Track-name keyword nudges (positive/negative valence words; energetic
//      / sedate words)
//   3. Duration (under 2.5min skews punky; over 7min skews ambient)
//
// The result is clamped to [0.02, 0.98] so points never sit exactly on a
// quadrant boundary or on the chart's edges.

const VALENCE_UP = /\b(love|happy|joy|sun|smile|dance|party|free|sweet|wonder|alive|shine|bright|good|together|laugh|play|gold|home)\b/;
const VALENCE_DOWN = /\b(sad|cry|tears|alone|lost|broken|empty|cold|dark|hurt|miss|gone|sorry|blue|grey|gray|fade|ghost|fall|die|death|wound)\b/;
const ENERGY_UP = /\b(fire|run|fight|loud|wild|mad|rage|burn|crash|wreck|riot|jump|hard|fast|kick|push|loud|bang|wreck|war)\b/;
const ENERGY_DOWN = /\b(slow|sleep|night|quiet|calm|gentle|soft|drift|float|lull|ocean|river|silent|whisper|still|breathe|easy|haze|dream)\b/;

export interface TrackMoodInput {
  name:         string;
  durationMs:   number;
  artistGenres: string[];
}

export function trackMood({ name, durationMs, artistGenres }: TrackMoodInput): MoodCoord {
  // Step 1: artist-genre baseline (mean of mapped coords).
  let energy = 0.5;
  let valence = 0.5;
  if (artistGenres.length > 0) {
    let sumE = 0, sumV = 0;
    for (const g of artistGenres) {
      const m = genreMood(g);
      sumE += m.energy;
      sumV += m.valence;
    }
    energy  = sumE / artistGenres.length;
    valence = sumV / artistGenres.length;
  }

  // Step 2: track-name keyword nudges.
  const lower = (name ?? '').toLowerCase();
  if (VALENCE_UP.test(lower))   valence += 0.10;
  if (VALENCE_DOWN.test(lower)) valence -= 0.14;
  if (ENERGY_UP.test(lower))    energy  += 0.12;
  if (ENERGY_DOWN.test(lower))  energy  -= 0.12;

  // Step 3: duration heuristic.
  const minutes = durationMs / 60_000;
  if (minutes > 0) {
    if (minutes < 2.5) {
      energy  += 0.05;
      valence -= 0.02;
    } else if (minutes > 7) {
      energy  -= 0.10;
    }
  }

  return {
    energy:  Math.max(0.02, Math.min(0.98, energy)),
    valence: Math.max(0.02, Math.min(0.98, valence)),
  };
}
