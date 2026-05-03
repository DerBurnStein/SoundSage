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

  // ─── Bright (high energy, high valence) ───────────────────────────────────
  if (/\b(dance|disco|funk|salsa|samba|reggaeton|edm|electro\s?pop|happy|party|tropical|afrobeats?|big band|swing)\b/.test(n))
    return { energy: 0.85, valence: 0.85 };
  if (/\b(pop|k-?pop|j-?pop|bubblegum|teen pop|new wave|power pop|britpop)\b/.test(n))
    return { energy: 0.72, valence: 0.78 };
  if (/\b(synth-?pop|electro|nu-disco|future funk)\b/.test(n))
    return { energy: 0.72, valence: 0.72 };

  // ─── Restless (high energy, low valence) ─────────────────────────────────
  if (/\b(metal|hardcore|thrash|grindcore|death\s?metal|black\s?metal|industrial|sludge|crust)\b/.test(n))
    return { energy: 0.94, valence: 0.18 };
  if (/\b(punk|post-punk|hardcore punk|emo|screamo|grunge|riot grrrl)\b/.test(n))
    return { energy: 0.85, valence: 0.28 };
  if (/\b(post-punk revival|coldwave|cold wave|dark\s?wave|gothic|goth\s?rock|witch house)\b/.test(n))
    return { energy: 0.65, valence: 0.25 };
  if (/\b(garage rock|noise|drum and bass|dnb|breakcore|hyperpop|drill|grime|trap metal)\b/.test(n))
    return { energy: 0.82, valence: 0.32 };
  if (/\b(math rock|post-hardcore|midwest emo|noise rock)\b/.test(n))
    return { energy: 0.78, valence: 0.4 };

  // ─── Peaceful (low energy, high valence) ─────────────────────────────────
  if (/\b(folk|folk rock|indie folk|alt-?folk|freak folk|bossa|samba folk|tropicalia)\b/.test(n))
    return { energy: 0.35, valence: 0.7 };
  if (/\b(acoustic|singer-?songwriter|country|americana|alt-?country|bluegrass)\b/.test(n))
    return { energy: 0.4, valence: 0.66 };
  if (/\b(chamber|chamber pop|baroque pop|gospel|lounge|easy listening)\b/.test(n))
    return { energy: 0.35, valence: 0.65 };
  if (/\b(jazz|smooth jazz|soul|r&b|rnb|neo-?soul|bedroom pop|sophisti-pop)\b/.test(n))
    return { energy: 0.45, valence: 0.65 };
  if (/\b(yacht rock|soft rock|adult contemporary|piano pop)\b/.test(n))
    return { energy: 0.4, valence: 0.6 };

  // ─── Contemplative (low energy, low valence) ─────────────────────────────
  if (/\b(ambient|drone|new age|meditation|asmr|isolationism)\b/.test(n))
    return { energy: 0.16, valence: 0.4 };
  if (/\b(classical|baroque|romantic|orchestral|piano|score|soundtrack|modern classical|minimalism|neo-?classical)\b/.test(n))
    return { energy: 0.38, valence: 0.42 };
  if (/\b(lo-?fi|chillwave|chillhop|slowcore|shoegaze|dream\s?pop|dreampop|sad|sadcore)\b/.test(n))
    return { energy: 0.30, valence: 0.34 };
  if (/\b(post-rock|ethereal wave|drone rock|space rock)\b/.test(n))
    return { energy: 0.5, valence: 0.36 };
  if (/\b(downtempo|trip-?hop|illbient|abstract hip hop)\b/.test(n))
    return { energy: 0.4, valence: 0.38 };
  if (/\b(witch house|darksynth|dark ambient|funeral|doom)\b/.test(n))
    return { energy: 0.45, valence: 0.18 };
  // Art rock + krautrock read as cerebral / textural — editorially
  // contemplative even though they can sit a bit higher on energy.
  if (/\b(art rock|krautrock)\b/.test(n))
    return { energy: 0.45, valence: 0.4 };

  // ─── Broader rock vocabulary (skews mid-energy, slightly cool) ──────────
  if (/\b(prog(ressive)? rock|psychedelic rock|stoner rock|jam band)\b/.test(n))
    return { energy: 0.65, valence: 0.45 };
  if (/\b(hard rock|heavy psych|blues rock|southern rock|glam rock|arena rock)\b/.test(n))
    return { energy: 0.72, valence: 0.5 };
  if (/\b(rock|alt(ernative)?\s?rock|modern rock)\b/.test(n))
    return { energy: 0.65, valence: 0.42 };

  // ─── Indie umbrella (cooler than before — was over-represented) ──────────
  if (/\b(indie folk|alt-?folk)\b/.test(n))
    return { energy: 0.4, valence: 0.55 };
  if (/\b(indie rock|garage indie)\b/.test(n))
    return { energy: 0.6, valence: 0.42 };
  if (/\b(indie pop|twee)\b/.test(n))
    return { energy: 0.55, valence: 0.6 };
  if (/\bindie\b/.test(n))
    return { energy: 0.5, valence: 0.45 };

  // ─── Electronic broad categories ────────────────────────────────────────
  if (/\b(deep house|tech house|minimal techno|microhouse)\b/.test(n))
    return { energy: 0.7, valence: 0.45 };
  if (/\b(house|techno|trance|psy-?trance|hardstyle|acid)\b/.test(n))
    return { energy: 0.78, valence: 0.55 };
  if (/\b(idm|glitch|ambient techno)\b/.test(n))
    return { energy: 0.55, valence: 0.4 };
  if (/\b(electronic|electronica|synth)\b/.test(n))
    return { energy: 0.6, valence: 0.45 };

  // ─── Hip-hop / R&B / global ─────────────────────────────────────────────
  if (/\b(boom bap|conscious hip-?hop|jazz rap|alternative hip-?hop)\b/.test(n))
    return { energy: 0.55, valence: 0.5 };
  if (/\b(hip-?hop|rap|trap|cloud rap|mumble rap)\b/.test(n))
    return { energy: 0.65, valence: 0.45 };
  if (/\b(reggae|roots reggae|dancehall|ska|dub)\b/.test(n))
    return { energy: 0.55, valence: 0.65 };
  if (/\b(latin|cumbia|bachata|reggaeton|tango|flamenco)\b/.test(n))
    return { energy: 0.7, valence: 0.65 };
  if (/\bworld|afro|highlife|kuduro|afrobeat\b/.test(n))
    return { energy: 0.65, valence: 0.6 };
  if (/\bblues\b/.test(n))
    return { energy: 0.45, valence: 0.4 };

  // ─── Default — slightly cool of centre so unknown genres don't all
  //     stack into the bright quadrant by default. The trackMood layer
  //     can still nudge them up via name keywords.
  return { energy: 0.48, valence: 0.45 };
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

const VALENCE_UP = /\b(love|happy|joy|sun|smile|dance|party|free|sweet|wonder|alive|shine|bright|good|together|laugh|play|gold|home|heart|hello|dream(?:ing)?|paradise|spring|forever|hope|honey|bloom|flower|warm|kiss)\b/;
const VALENCE_DOWN = /\b(sad|cry|tears|alone|lost|broken|empty|cold|dark|hurt|miss|gone|sorry|blue|grey|gray|fade|ghost|fall|die|death|wound|black|shadow|funeral|grave|nothing|nobody|never|won't|cant|ache|pain|silence|drown|sink|end|over|leave|leaving|left|goodbye|farewell|bury|burn(?:ed)?)\b/;
const ENERGY_UP = /\b(fire|run|fight|loud|wild|mad|rage|burn|crash|wreck|riot|jump|hard|fast|kick|push|bang|war|shake|rock|roar|scream|shout|chase|race|attack|smash|blast|storm|thunder|electric|alive|wake)\b/;
const ENERGY_DOWN = /\b(slow|sleep|night|quiet|calm|gentle|soft|drift|float|lull|ocean|river|silent|whisper|still|breathe|easy|haze|dream|moon|fog|mist|cloud|snow|winter|sunday|home|rest|sigh|wait|wander)\b/;

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

  // Step 2: track-name keyword nudges. Deliberately heavier than the genre
  // baseline so a single well-tuned word can pull a track out of its
  // genre's default quadrant — e.g. an "indie rock" track called
  // "Funeral" should land in contemplative, not bright.
  const lower = (name ?? '').toLowerCase();
  if (VALENCE_UP.test(lower))   valence += 0.16;
  if (VALENCE_DOWN.test(lower)) valence -= 0.20;
  if (ENERGY_UP.test(lower))    energy  += 0.16;
  if (ENERGY_DOWN.test(lower))  energy  -= 0.18;

  // Step 3: duration heuristic. Long tracks (> 5min) skew sedate; very
  // short tracks (< 2min) skew punky. Both pull harder than the previous
  // values so duration actually moves the needle in the cloud.
  const minutes = durationMs / 60_000;
  if (minutes > 0) {
    if (minutes < 2) {
      energy  += 0.08;
      valence -= 0.04;
    } else if (minutes < 2.5) {
      energy  += 0.05;
      valence -= 0.02;
    } else if (minutes > 8) {
      energy  -= 0.16;
      valence -= 0.04;
    } else if (minutes > 5) {
      energy  -= 0.08;
    }
  }

  return {
    energy:  Math.max(0.02, Math.min(0.98, energy)),
    valence: Math.max(0.02, Math.min(0.98, valence)),
  };
}
