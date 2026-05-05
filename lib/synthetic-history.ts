// SoundSage — Synthetic listening-history generator (v4)
//
// v3 produced realistic-shape Zipf distributions but two outlier issues:
//
//   1. Top track absorbed ~17% of all plays (a top track in real ESH
//      dumps is closer to 1-3%). One song getting 2200 plays in a year
//      reads as a glitch.
//   2. Single-artist dominance: 95% of plays attributed to one artist
//      because the user's top-tracks AND top-artists snapshots both
//      heavily featured them, and synth had no diversity safeguard.
//   3. Daily plateau persisted because base rate × all-multipliers-at-1
//      was right at the daily cap, so most days still pegged.
//
// v4 fixes these structurally:
//
//   • Per-track play cap (4% of total plays). When sampling would push a
//     track over the cap, we re-roll, excluding it. Caps the "Thoughts ×
//     2200" outlier without breaking the Zipf shape underneath.
//   • Per-artist play cap (38% of total plays). Same mechanism. Users
//     who genuinely listen to mostly one artist will still see them
//     dominate, but not at 95%.
//   • Pool expansion via /me/tracks (saved/liked songs, up to 100). These
//     are pure long-tail content the user has actually flagged — perfect
//     for filling the bottom of a real listening histogram.
//   • Lower daily cap (75) and lower base-rate floor (22) — most days
//     land in the 15-50 range with the cap as a rare ceiling, so the
//     daily-listening chart shows real variance.
//   • Softer multiplier extremes — mood walk and noise reduced so a
//     stack of "all peak" multipliers doesn't constantly clip the cap.
//
// Original v3 architecture (intensity model + lifecycles + per-day
// sampling) is preserved — only the constants and cap logic changed.
//
// v1 and v2 produced flat data that didn't look like real human listening.
// v2 in particular hit the 80-plays-per-day cap on nearly every day, so
// the daily-listening chart was a flat plateau. Real ESH dumps and
// last.fm scrobble histories show wildly varying daily volumes — some
// days near zero (vacation, sick, busy), some days 5x average (binge
// sessions, road trips). Songs come into rotation, peak for 2-3 weeks,
// then fade. Some weeks are heavy listening, others light.
//
// v3 separates the "how much is played each day" model from the "which
// tracks are played" model and runs them as independent layered processes,
// the way real listening actually emerges.
//
// ─── How it works ────────────────────────────────────────────────────────
//
// Layer 1 — DAILY INTENSITY MODEL: for each of the past 365 days, decide
// how many plays the user did that day. We multiply six independent
// signals to get a target:
//
//   1. Base rate (from observed daily plays, floored at 30)
//   2. Day-of-week multiplier (weekday vs. weekend, derived from real
//      fingerprint)
//   3. Seasonal sine wave over 365 days (~ ±15% amplitude)
//   4. Weekly sine wave over 7 days (~ ±10%)
//   5. Mood walk (mean-reverting random walk producing 1-3 week stretches
//      of heavier or lighter listening — "I was on a Brian Eno kick last
//      month")
//   6. Daily noise (gaussian, σ ~ 0.35× mean)
//
// On top of that, ~14% of days get a "day type" event:
//   • Zero/quiet day (8%): 0-15% of normal — vacation, sick, family stuff
//   • Binge day (5%): 1.7-2.3× normal — long drive, deep work session
//   • Mega-binge (1%): 2.5-3.5× normal — concert prep, sleepless night
//
// Layer 2 — TRACK LIFECYCLES: every track in the pool gets a peak day
// somewhere in the past year and a decay sigma in days. Top short-term
// tracks peak in the last 21 days with tight 8-23 day sigma (intense
// recent obsession). Long-term tracks peak 2-12 months ago with broad
// 50-150 day sigma (background catalog). On any given day, each track
// has a "listenability" weight = peak_amplitude * gaussian_kernel(day -
// peak_day, sigma). New favorites rise and fall; old favorites are
// always there at low volume.
//
// Layer 3 — DAILY TRACK SAMPLING: for each day, we know the target play
// count from layer 1. We sample that many tracks from the layer-2 weight
// distribution for THAT day. Tracks at their peak land heavily on those
// days; tracks past their peak appear rarely. A track can naturally
// appear ~5-15 times on its peak day and 0 times most other days.
//
// Layer 4 — HOUR-OF-DAY: each play gets a timestamp using the user's
// actual hour-of-day fingerprint from /recently-played, smoothed with a
// generic awake-hours curve. Random minute/second jitter for natural
// variation.
//
// Layer 5 — COMPLETION: msPlayed varies realistically — 78% of plays are
// 85-100% complete, 17% are 50-85% (didn't quite finish), 5% are skipped
// at 30s-50%. Drives the per-day "minutes listened" stat to look human.
//
// ─── Replacement semantics ───────────────────────────────────────────────
//
// Every event written here is `source: 'synthetic'`. The ESH and Last.FM
// import runners delete-where-source-synthetic before persisting their
// own rows, so as soon as the user uploads real history, all of this is
// replaced with truth.

import { db } from './db';
import { spotifyGet, type SpotifyTrackDetails, type SpotifyArtistDetails } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

const DAY_MS = 86_400_000;

// ─── Tunable constants ───────────────────────────────────────────────────────

// Target window: last 365 days. Anything beyond this is rare in real ESH
// dumps for active users (most listening is from the last year).
const HISTORY_DAYS = 365;
// Floor on daily rate — used when /recently-played returned few items.
// Real moderate Spotify users average 25-35 plays/day. We floor at 22 so
// even on quiet observed-rate accounts the charts populate, and tune so
// most days land in the 15-50 range with peaks reaching the cap rather
// than constantly hitting it (the v3 plateau bug).
const BASE_DAILY_RATE_FLOOR = 22;
// Daily cap. Lower than v3 (was 110) — even heavy listeners rarely
// exceed 75 plays in a 24-hour day (~5 hours of continuous listening).
// Acts as a rare ceiling, not a constant clamp.
const MAX_PLAYS_PER_DAY = 75;
// Caps that prevent the v3 outliers. After many ESH dumps, the empirical
// rule is: no single track exceeds ~3% of yearly plays for a normal user;
// no single artist exceeds ~40% even for genre purists. We use slightly
// generous variants of these as ceilings — the Zipf shape decides actual
// distribution beneath the cap.
const MAX_TRACK_SHARE = 0.04;   // 4% of total plays
const MAX_ARTIST_SHARE = 0.38;  // 38% of total plays
// Filler track pool size — long tail of "songs you heard a few times last
// summer." Bumped to widen the pool and reduce concentration on top items.
const ARTISTS_FOR_FILLER = 35;
const FILLER_TRACKS_PER_ARTIST = 8;
// Saved/liked songs are the cleanest source of "long-tail tracks the user
// has actually heard at least once." Pulling 100 of them adds genuine
// variety to the pool without inventing artists.
const SAVED_TRACKS_TARGET = 100;
// Day-type event probabilities (sum to 0.14 — 14% of days get something
// non-routine; the remaining 86% are "normal" daily variance).
const PROB_QUIET_DAY = 0.08;
const PROB_BINGE_DAY = 0.05;
const PROB_MEGA_BINGE = 0.01;

// Completion model. Loosely matches public ESH dumps shared on r/spotify.
const COMPLETION_NEAR_FULL = 0.78; // 85-100% of duration
const COMPLETION_PARTIAL = 0.17; // 50-85%
// remaining 0.05 = skipped (30s to 50% of duration)

// ─── Public types ────────────────────────────────────────────────────────────

export interface SyntheticResult {
  totalPlaysGenerated: number;
  uniqueTracks: number;
  earliestPlay: string;
  latestPlay: string;
  byRange: Record<string, number>;
  // v3 diagnostics — verifies variance is present.
  dailyStats: {
    median: number;
    p10: number;
    p90: number;
    max: number;
    min: number;
    zeroDays: number;
    bingeDays: number;
  };
  // v4 diagnostics — verifies the per-track and per-artist caps are
  // holding. topTrackShare > 0.05 or topArtistShare > 0.45 indicates a
  // regression in the rejection-sampling logic.
  topTrackShare: number;
  topArtistShare: number;
}

// ─── Spotify response shapes ────────────────────────────────────────────────

interface RecentItem { played_at: string; }
interface RecentResponse { items: RecentItem[]; }
interface TopTracksResp { items: SpotifyTrackDetails[]; }
interface TopArtistsResp { items: SpotifyArtistDetails[]; }
interface ArtistTopTracksResp { tracks: SpotifyTrackDetails[]; }
interface SavedTracksResp { items: { track: SpotifyTrackDetails }[]; }

// ─── Random helpers ──────────────────────────────────────────────────────────

// Box-Muller — gives gaussian samples we use throughout for noise.
function sampleGaussian(mean: number, stdDev: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function weightedSample(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ─── Hour + weekday fingerprint from recently-played ────────────────────────

interface Fingerprint {
  hourWeights: number[];   // length 24, sums > 0
  weekdayWeights: number[]; // length 7 (0=Sun)
  weekdayMean: number;
}

function genericHourCurve(): number[] {
  // Three-peak (morning / lunch / evening) hour-of-day distribution
  // calibrated against public Spotify ESH dumps and ListenBrainz datasets.
  // The previous curve had a flat plateau from 6pm-10pm and only one
  // gentle morning bump; combined with a heavy real-data blend, that
  // produced charts where 95% of plays clustered at whatever single
  // hour the user happened to listen during their last 24h.
  //
  // Real listening shape:
  //   • Morning ramp 6am-9am — wake/commute/work-start
  //   • Mid-morning shoulder 10-11am
  //   • Lunch peak 12-1pm — the second daily high point
  //   • Afternoon valley 2-4pm — work focus, less listening
  //   • Evening ramp 5-7pm — commute home / dinner
  //   • Evening peak 7-10pm — usually the highest point of the day
  //   • Wind-down 11pm-1am — fading
  //   • Sleep 2-5am — near zero
  const w: number[] = new Array(24).fill(0.04);
  // Sleep / dead hours
  w[2] = 0.04; w[3] = 0.04; w[4] = 0.04; w[5] = 0.06;
  // Morning ramp + commute
  w[6] = 0.32; w[7] = 0.62; w[8] = 0.78; w[9] = 0.72;
  // Mid-morning shoulder
  w[10] = 0.55; w[11] = 0.58;
  // Lunch peak (~80% of evening peak)
  w[12] = 0.82; w[13] = 0.74;
  // Afternoon valley
  w[14] = 0.55; w[15] = 0.58; w[16] = 0.66;
  // Evening commute / dinner
  w[17] = 0.85; w[18] = 0.95;
  // Evening peak — the day's high point in most ESH dumps
  w[19] = 1.0; w[20] = 0.98; w[21] = 0.92;
  // Wind-down
  w[22] = 0.78; w[23] = 0.55;
  // Late-night tail — small but non-zero
  w[0] = 0.32; w[1] = 0.16;
  return w;
}

// Circular gaussian smoothing over 24-hour buckets. Spreads each sample's
// influence to neighboring hours so a 50-sample fingerprint that all
// landed at hour 7 doesn't produce a single spike — it produces a soft
// hump centered on 7 that fades out by hour 4 and 10. Sigma ~1.6 hours
// matches the natural "session" duration of music listening.
function smoothHourly(buckets: number[], sigma: number): number[] {
  const N = buckets.length;
  const out = new Array(N).fill(0);
  // Pre-compute kernel out to ~3σ.
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    kernelSum += w;
  }
  // Normalize so smoothing preserves total mass.
  const norm = kernel.map((w) => w / kernelSum);
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = ((i + k) % N + N) % N; // wrap circularly
      acc += buckets[idx] * norm[k + radius];
    }
    out[i] = acc;
  }
  return out;
}

function genericWeekdayCurve(): number[] {
  // Slight weekend lift, Saturday afternoon-evening typically peaks in
  // public scrobble datasets. Sunday slightly lower than Saturday.
  return [1.05, 0.92, 0.93, 0.95, 0.97, 1.05, 1.13];
}

function buildFingerprint(items: RecentItem[]): Fingerprint {
  const generic = genericHourCurve();
  const genericDay = genericWeekdayCurve();

  if (items.length < 5) {
    const dayMean = genericDay.reduce((s, w) => s + w, 0) / 7;
    return { hourWeights: generic, weekdayWeights: genericDay, weekdayMean: dayMean };
  }

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  for (const it of items) {
    const d = new Date(it.played_at);
    hourCounts[d.getUTCHours()] += 1;
    dayCounts[d.getUTCDay()] += 1;
  }

  // STEP 1 — smooth the raw real fingerprint with a circular gaussian
  // (σ = 1.6 hours, radius ~5h). With only 50 samples in /recently-played,
  // the raw histogram is incredibly sparse — typically one or two hours
  // get most of the weight. Smoothing spreads each sample across a
  // ~3-hour window so the user's "morning person" or "night owl" tilt
  // shows up as a soft hump rather than a single-pixel spike.
  const totalReal = items.length;
  const realRaw = hourCounts.map((c) => (c / totalReal) * 24); // normalize to mean=1
  const realSmooth = smoothHourly(realRaw, 1.6);

  // STEP 2 — much lighter blend. Was 60% real / 40% generic; that let
  // a Sunday-morning-only fingerprint dominate the entire year of
  // synthetic plays. Now 25% real / 75% generic, so the user's
  // listening tendency is a *modulation* of the realistic three-peak
  // shape rather than a replacement of it. Effect: every chart shows
  // morning + lunch + evening peaks, but their relative heights tilt
  // toward whichever the user actually favors.
  const hourWeights = generic.map((g, h) => 0.75 * g + 0.25 * realSmooth[h]);

  // Weekday gets a similar treatment — light user influence on top of
  // the realistic Mon-Sun curve. Smoothing isn't necessary here (only
  // 7 buckets, samples spread naturally).
  const weekdayWeights = genericDay.map(
    (g, d) => 0.75 * g + 0.25 * (dayCounts[d] / totalReal) * 7
  );
  const weekdayMean = weekdayWeights.reduce((s, w) => s + w, 0) / 7;

  return { hourWeights, weekdayWeights, weekdayMean };
}

// ─── Layer 1: per-day intensity model ────────────────────────────────────────

interface DayIntensity {
  date: Date;
  dayIndex: number; // 0..HISTORY_DAYS-1, 0 = oldest, HISTORY_DAYS-1 = today
  targetPlays: number;
  // Diagnostic flags — useful for logging.
  type: 'normal' | 'quiet' | 'binge' | 'mega';
}

function generateDailyIntensities(
  now: Date,
  baseRate: number,
  fp: Fingerprint
): DayIntensity[] {
  const intensities: DayIntensity[] = [];

  // Random phase offsets so two synth runs for the same user don't have
  // identical seasonal/weekly waves.
  const seasonOffset = Math.random() * 2 * Math.PI;
  const weeklyOffset = Math.random() * 2 * Math.PI;

  // Mood random walk: mean-reverting with shocks. Produces stretches of
  // heavier or lighter listening over 1-3 weeks rather than i.i.d. noise.
  const mood = generateMoodWalk(HISTORY_DAYS);

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = new Date(now.getTime() - (HISTORY_DAYS - 1 - i) * DAY_MS);
    const dayOfWeek = date.getUTCDay();

    // Multipliers — tightened from v3 so the daily cap is a rare event
    // rather than a regular clip. Combined product of "all peak"
    // multipliers should approach but rarely exceed cap.
    const weekdayMult = fp.weekdayWeights[dayOfWeek] / fp.weekdayMean;
    const seasonalMult = 1 + 0.13 * Math.sin((2 * Math.PI * i) / 365 + seasonOffset);
    const weeklyMult = 1 + 0.08 * Math.sin((2 * Math.PI * i) / 7 + weeklyOffset);
    const moodMult = mood[i];
    // σ reduced from 0.32 → 0.25 so most days land within ±50% of mean.
    const dailyNoise = clamp(sampleGaussian(1, 0.25), 0.35, 1.7);

    // Day-type roll. Binge multiplier reduced (was 2.0±0.3, now 1.6±0.25)
    // so a binge-day on top of high baseline doesn't blow past the cap.
    const r = Math.random();
    let typeMult = 1.0;
    let type: DayIntensity['type'] = 'normal';
    if (r < PROB_QUIET_DAY) {
      typeMult = clamp(sampleGaussian(0.1, 0.08), 0, 0.3);
      type = 'quiet';
    } else if (r < PROB_QUIET_DAY + PROB_BINGE_DAY) {
      typeMult = clamp(sampleGaussian(1.6, 0.25), 1.3, 2.2);
      type = 'binge';
    } else if (r < PROB_QUIET_DAY + PROB_BINGE_DAY + PROB_MEGA_BINGE) {
      typeMult = clamp(sampleGaussian(2.3, 0.4), 1.9, 3.0);
      type = 'mega';
    }

    let target = baseRate * weekdayMult * seasonalMult * weeklyMult * moodMult * dailyNoise * typeMult;
    target = clamp(Math.round(target), 0, MAX_PLAYS_PER_DAY);

    intensities.push({ date, dayIndex: i, targetPlays: target, type });
  }
  return intensities;
}

// Mean-reverting random walk. Drives multi-day mood swings ("had a Brian
// Eno week"). Range tightened in v4 [0.5, 1.5] from v3's [0.4, 1.7] so a
// mood peak doesn't compound with other peak multipliers and clip the cap.
function generateMoodWalk(days: number): number[] {
  const out: number[] = new Array(days);
  let mood = 1.0;
  for (let i = 0; i < days; i++) {
    const drift = -0.05 * (mood - 1.0); // slightly stronger mean reversion
    const shock = sampleGaussian(0, 0.07); // smaller daily shock
    mood = clamp(mood + drift + shock, 0.5, 1.5);
    out[i] = mood;
  }
  return out;
}

// ─── Layer 2: per-track lifecycles ──────────────────────────────────────────

interface PooledTrack {
  id: string;
  durationMs: number;
  weight: number; // accumulated rank/range weight
  primaryRange: 'short_term' | 'medium_term' | 'long_term' | 'filler';
  // Primary artist id — first artist on the track. Used for the per-
  // artist-share cap during sampling so a single artist can't dominate
  // the entire generated history (>38% of plays).
  primaryArtistId: string;
}

interface TrackLifecycle {
  trackId: string;
  durationMs: number;
  peakDayIndex: number;
  sigmaDays: number;
  amplitude: number;
  primaryArtistId: string;
}

function buildLifecycles(pool: PooledTrack[]): TrackLifecycle[] {
  // Sort by weight descending so the highest-weighted tracks land in the
  // most recent / tightest peaks.
  const sorted = [...pool].sort((a, b) => b.weight - a.weight);

  return sorted.map((t, idx) => {
    let peakDayIndex: number;
    let sigmaDays: number;

    // Peak placement and sigma scale by primary range. Within each range,
    // top-ranked tracks get tighter (more obsessive) peaks; lower-ranked
    // tracks have broader, gentler curves.
    const rankFraction = idx / Math.max(1, sorted.length - 1); // 0 = top, 1 = tail

    switch (t.primaryRange) {
      case 'short_term': {
        // Peak 0-28 days ago, with the highest ranks landing in the last
        // 14 days (the user's "current obsession"). Sigma 8-22 days —
        // intense recent listening that drops off in 2-3 weeks.
        const offset = Math.floor(Math.random() * 28);
        peakDayIndex = HISTORY_DAYS - 1 - offset;
        sigmaDays = 8 + Math.random() * 14 + rankFraction * 8;
        break;
      }
      case 'medium_term': {
        // Peak 14-180 days ago. Wider sigma 25-65 days. These are tracks
        // the user heard a lot during a 1-2 month phase, fading now.
        const offset = 14 + Math.floor(Math.random() * 166);
        peakDayIndex = HISTORY_DAYS - 1 - offset;
        sigmaDays = 25 + Math.random() * 40;
        break;
      }
      case 'long_term': {
        // Peak 30-330 days ago, very broad 50-130 day sigma. These are
        // catalog tracks heard occasionally across months.
        const offset = 30 + Math.floor(Math.random() * 300);
        peakDayIndex = HISTORY_DAYS - 1 - offset;
        sigmaDays = 50 + Math.random() * 80;
        break;
      }
      case 'filler':
      default: {
        // Filler tracks scatter randomly across the year with very wide
        // sigmas — they're the long-tail "I heard this song twice last
        // year" pattern.
        peakDayIndex = Math.floor(Math.random() * HISTORY_DAYS);
        sigmaDays = 90 + Math.random() * 120;
        break;
      }
    }

    return {
      trackId: t.id,
      durationMs: t.durationMs,
      peakDayIndex,
      sigmaDays,
      amplitude: t.weight,
      primaryArtistId: t.primaryArtistId,
    };
  });
}

// ─── Layer 3: per-day track sampling ────────────────────────────────────────

interface PlannedEvent {
  trackId: string;
  durationMs: number;
  playedAt: Date;
}

function generateEvents(
  intensities: DayIntensity[],
  lifecycles: TrackLifecycle[],
  fp: Fingerprint
): PlannedEvent[] {
  const events: PlannedEvent[] = [];

  // Per-track and per-artist running counts for rejection-sampling caps.
  // Real ESH dumps for active users keep top-track share under ~3% and
  // top-artist share under ~40%. We compute caps from the projected total
  // (sum of intensity targets) and reject samples that would exceed them
  // — the rejected slot gets re-rolled, picking another candidate
  // weighted by the same kernels but excluding capped tracks/artists.
  const totalTarget = intensities.reduce((s, d) => s + d.targetPlays, 0);
  const maxPerTrack = Math.max(1, Math.floor(totalTarget * MAX_TRACK_SHARE));
  const maxPerArtist = Math.max(1, Math.floor(totalTarget * MAX_ARTIST_SHARE));

  const trackCount = new Map<string, number>();
  const artistCount = new Map<string, number>();
  // Tracks/artists that have reached their cap during this run — we mask
  // their weights to zero on subsequent samples instead of re-checking
  // every iteration.
  const cappedTrackIdx = new Set<number>();
  const cappedArtistIds = new Set<string>();

  for (const day of intensities) {
    if (day.targetPlays <= 0) continue;

    // Base weights (gaussian kernel × amplitude) — recomputed per day
    // since each track's peak makes its weight vary across the year.
    const baseWeights = lifecycles.map((l) => {
      const dx = day.dayIndex - l.peakDayIndex;
      const k = Math.exp(-(dx * dx) / (2 * l.sigmaDays * l.sigmaDays));
      return l.amplitude * k + 0.001 * l.amplitude;
    });

    for (let p = 0; p < day.targetPlays; p++) {
      // Mask out tracks/artists that have hit their cap. If everything
      // we'd want to play is capped (extreme edge case), we still emit
      // the play using the unmasked weights — the cap is a soft limit
      // rather than a strict upper bound.
      const live = baseWeights.map((w, i) => {
        if (cappedTrackIdx.has(i)) return 0;
        if (cappedArtistIds.has(lifecycles[i].primaryArtistId)) return 0;
        return w;
      });
      const total = live.reduce((s, w) => s + w, 0);
      const sampleFrom = total > 0 ? live : baseWeights;
      const trackIdx = weightedSample(sampleFrom);
      const track = lifecycles[trackIdx];

      // Update counts and check caps for next iteration.
      const tc = (trackCount.get(track.trackId) ?? 0) + 1;
      trackCount.set(track.trackId, tc);
      if (tc >= maxPerTrack) cappedTrackIdx.add(trackIdx);

      if (track.primaryArtistId) {
        const ac = (artistCount.get(track.primaryArtistId) ?? 0) + 1;
        artistCount.set(track.primaryArtistId, ac);
        if (ac >= maxPerArtist) cappedArtistIds.add(track.primaryArtistId);
      }

      const hour = weightedSample(fp.hourWeights);
      const playedAt = new Date(day.date);
      playedAt.setUTCHours(
        hour,
        Math.floor(Math.random() * 60),
        Math.floor(Math.random() * 60),
        0
      );

      events.push({
        trackId: track.trackId,
        durationMs: track.durationMs,
        playedAt,
      });
    }
  }

  return events;
}

// ─── Layer 5: completion model ──────────────────────────────────────────────

function pickMsPlayed(durationMs: number): number {
  const r = Math.random();
  if (r < COMPLETION_NEAR_FULL) {
    return Math.round(durationMs * (0.85 + Math.random() * 0.15));
  } else if (r < COMPLETION_NEAR_FULL + COMPLETION_PARTIAL) {
    return Math.round(durationMs * (0.5 + Math.random() * 0.35));
  } else {
    const minMs = 30_000;
    const maxMs = Math.max(minMs + 1, Math.round(durationMs * 0.5));
    return minMs + Math.floor(Math.random() * (maxMs - minMs));
  }
}

// ─── Pool building from snapshots + artist top-tracks ───────────────────────

async function buildTrackPool(
  userId: string,
  accessToken: string
): Promise<PooledTrack[]> {
  const ranges: Array<'short_term' | 'medium_term' | 'long_term'> = [
    'short_term',
    'medium_term',
    'long_term',
  ];
  const RANGE_WEIGHT = { short_term: 3.0, medium_term: 1.8, long_term: 1.0 };

  const byTrackId = new Map<string, PooledTrack>();

  // Snapshot top-tracks across all three ranges. We pull artistIds[0]
  // from the Track row so the per-artist cap can group plays correctly
  // during sampling.
  for (const range of ranges) {
    const snaps = await db.topTrackSnapshot.findMany({
      where: { userId, range },
      orderBy: { rank: 'asc' },
      include: { track: { select: { id: true, durationMs: true, artistIds: true } } },
    });

    type TrackListItem = { id: string; rank: number; durationMs: number | null; artistId: string };
    let trackList: TrackListItem[] = snaps.map((s) => ({
      id: s.trackId,
      rank: s.rank,
      durationMs: s.track?.durationMs ?? null,
      artistId: s.track?.artistIds?.[0] ?? '',
    }));

    if (trackList.length === 0) {
      try {
        const live = await spotifyGet<TopTracksResp>(
          `/me/top/tracks?time_range=${range}&limit=50`,
          accessToken
        );
        trackList = live.items.map((t, i) => ({
          id: t.id,
          rank: i + 1,
          durationMs: t.duration_ms,
          artistId: t.artists[0]?.id ?? '',
        }));
        await persistTrackBatch(live.items);
      } catch (err) {
        logger.warn({ userId, range, err: String(err) }, 'synth: live top-tracks fetch failed');
      }
    }

    for (const t of trackList) {
      // Zipfian weight from rank within this range.
      const rankWeight = 1 / Math.pow(t.rank, 0.85);
      const contribution = RANGE_WEIGHT[range] * rankWeight;
      const existing = byTrackId.get(t.id);
      if (existing) {
        existing.weight += contribution;
        // Earliest range a track appears in is its primary range.
        if (
          range === 'short_term' ||
          (range === 'medium_term' && existing.primaryRange === 'long_term')
        ) {
          existing.primaryRange = range;
        }
      } else {
        byTrackId.set(t.id, {
          id: t.id,
          durationMs: t.durationMs ?? 210_000,
          weight: contribution,
          primaryRange: range,
          primaryArtistId: t.artistId,
        });
      }
    }
  }

  // Artist filler tracks — long-tail pool. Pull each top artist's top-N
  // tracks from /artists/{id}/top-tracks. Most are NEW to the pool (the
  // user hadn't ranked them in their top-50 list, but they ARE artist-
  // favorites they've heard a few times). Critically: assign them as
  // "filler" so their lifecycle peaks scatter across the full year
  // rather than clustering with their parent range.
  for (const range of ranges) {
    const artistSnaps = await db.topArtistSnapshot.findMany({
      where: { userId, range },
      orderBy: { rank: 'asc' },
      take: ARTISTS_FOR_FILLER,
    });

    let artistList = artistSnaps.map((a) => ({ id: a.artistId, rank: a.rank }));
    if (artistList.length === 0) {
      try {
        const live = await spotifyGet<TopArtistsResp>(
          `/me/top/artists?time_range=${range}&limit=${ARTISTS_FOR_FILLER}`,
          accessToken
        );
        artistList = live.items.map((a, i) => ({ id: a.id, rank: i + 1 }));
      } catch {
        // Skip silently.
      }
    }

    for (const a of artistList) {
      try {
        const top = await spotifyGet<ArtistTopTracksResp>(
          `/artists/${a.id}/top-tracks?market=from_token`,
          accessToken
        );
        const tracksToAdd = top.tracks.slice(0, FILLER_TRACKS_PER_ARTIST);
        await persistTrackBatch(tracksToAdd);

        for (let i = 0; i < tracksToAdd.length; i++) {
          const t = tracksToAdd[i];
          const artistRankWeight = 1 / Math.pow(a.rank, 0.6);
          const positionWeight = 1 / Math.pow(i + 1, 0.4);
          const contribution = 0.35 * artistRankWeight * positionWeight * RANGE_WEIGHT[range];
          const existing = byTrackId.get(t.id);
          if (existing) {
            existing.weight += contribution * 0.4; // partial credit if already ranked
          } else {
            byTrackId.set(t.id, {
              id: t.id,
              durationMs: t.duration_ms,
              weight: contribution,
              primaryRange: 'filler',
              primaryArtistId: t.artists[0]?.id ?? a.id,
            });
          }
        }
      } catch {
        // One bad artist shouldn't kill the synth.
      }
    }
  }

  // Saved tracks (/me/tracks) — long-tail diversity. Songs the user has
  // explicitly liked but may not be in their top-50. Adds variety to the
  // pool so the per-artist cap has somewhere to redistribute when the
  // user's top artist hits its ceiling. Up to SAVED_TRACKS_TARGET items.
  try {
    const PAGE = 50;
    let fetched = 0;
    let offset = 0;
    while (fetched < SAVED_TRACKS_TARGET) {
      const limit = Math.min(PAGE, SAVED_TRACKS_TARGET - fetched);
      const resp = await spotifyGet<SavedTracksResp>(
        `/me/tracks?limit=${limit}&offset=${offset}`,
        accessToken
      );
      if (!resp.items || resp.items.length === 0) break;

      const tracks = resp.items.map((it) => it.track).filter(Boolean);
      await persistTrackBatch(tracks);

      for (const t of tracks) {
        const existing = byTrackId.get(t.id);
        // Saved tracks get a small fixed weight — they're "I liked this
        // once" not "I'm currently obsessed" — so they fill in the long
        // tail without competing with top tracks at the head.
        const savedWeight = 0.25;
        if (existing) {
          existing.weight += savedWeight * 0.3;
        } else {
          byTrackId.set(t.id, {
            id: t.id,
            durationMs: t.duration_ms,
            weight: savedWeight,
            primaryRange: 'filler',
            primaryArtistId: t.artists[0]?.id ?? '',
          });
        }
      }

      fetched += resp.items.length;
      offset += resp.items.length;
      if (resp.items.length < limit) break;
    }
  } catch (err) {
    logger.warn({ userId, err: String(err) }, 'synth: saved-tracks fetch failed (non-fatal)');
  }

  return Array.from(byTrackId.values());
}

async function persistTrackBatch(tracks: SpotifyTrackDetails[]): Promise<void> {
  for (const t of tracks) {
    try {
      await db.track.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          name: t.name,
          // Always populate artist names — empty arrays cause "Unknown
          // artist" downstream. Spotify always returns at least one artist
          // on a successful track lookup.
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album?.name ?? null,
          albumId: t.album?.id ?? null,
          imageUrl: t.album?.images?.[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
        update: {
          name: t.name,
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album?.name ?? null,
          albumId: t.album?.id ?? null,
          imageUrl: t.album?.images?.[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
      });
    } catch (err) {
      logger.warn({ trackId: t.id, err: String(err) }, 'synth: track upsert failed');
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

function summarizeDaily(intensities: DayIntensity[]): SyntheticResult['dailyStats'] {
  const counts = intensities.map((d) => d.targetPlays).sort((a, b) => a - b);
  const pct = (p: number) => counts[Math.min(counts.length - 1, Math.floor((counts.length - 1) * p))];
  return {
    median: pct(0.5),
    p10: pct(0.1),
    p90: pct(0.9),
    max: counts[counts.length - 1],
    min: counts[0],
    zeroDays: intensities.filter((d) => d.targetPlays === 0).length,
    bingeDays: intensities.filter((d) => d.type === 'binge' || d.type === 'mega').length,
  };
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

export async function generateSyntheticHistory(userId: string): Promise<SyntheticResult> {
  // Replace, don't merge.
  await db.listeningEvent.deleteMany({ where: { userId, source: 'synthetic' } });

  const accessToken = await ensureFreshToken(userId);

  // Fingerprint from real recently-played samples.
  let recent: RecentResponse;
  try {
    recent = await spotifyGet<RecentResponse>('/me/player/recently-played?limit=50', accessToken);
  } catch (err) {
    logger.warn({ userId, err: String(err) }, 'synth: recently-played fetch failed');
    recent = { items: [] };
  }
  const fingerprint = buildFingerprint(recent.items);

  // Daily-rate calibration. recently-played covers ~24h, so item count is
  // a rough plays-per-day estimate. Floor at BASE_DAILY_RATE_FLOOR.
  const observedDailyRate = Math.max(recent.items.length, BASE_DAILY_RATE_FLOOR);

  const pool = await buildTrackPool(userId, accessToken);
  if (pool.length === 0) {
    logger.warn({ userId }, 'synth: empty pool');
    return {
      totalPlaysGenerated: 0,
      uniqueTracks: 0,
      earliestPlay: '',
      latestPlay: '',
      byRange: { short_term: 0, medium_term: 0, long_term: 0 },
      dailyStats: { median: 0, p10: 0, p90: 0, max: 0, min: 0, zeroDays: 0, bingeDays: 0 },
      topTrackShare: 0,
      topArtistShare: 0,
    };
  }

  const now = new Date();

  // Layer 1: per-day intensity model.
  const intensities = generateDailyIntensities(now, observedDailyRate, fingerprint);

  // Layer 2: per-track lifecycles.
  const lifecycles = buildLifecycles(pool);

  // Layer 3: sample tracks per day according to lifecycle weights.
  const events = generateEvents(intensities, lifecycles, fingerprint);

  // Persist in chunks.
  let inserted = 0;
  const CHUNK = 1000;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    const result = await db.listeningEvent.createMany({
      data: chunk.map((e) => ({
        userId,
        trackId: e.trackId,
        playedAt: e.playedAt,
        msPlayed: pickMsPlayed(e.durationMs),
        source: 'synthetic',
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  // Reporting — bucket by primary range for diagnostics.
  const byRange: Record<string, number> = { short_term: 0, medium_term: 0, long_term: 0 };
  const cutoff28 = new Date(now.getTime() - 28 * DAY_MS).getTime();
  const cutoff180 = new Date(now.getTime() - 180 * DAY_MS).getTime();
  for (const e of events) {
    const ms = e.playedAt.getTime();
    if (ms >= cutoff28) byRange.short_term++;
    else if (ms >= cutoff180) byRange.medium_term++;
    else byRange.long_term++;
  }

  const sorted = [...events].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const earliestPlay = sorted[0]?.playedAt.toISOString() ?? '';
  const latestPlay = sorted[sorted.length - 1]?.playedAt.toISOString() ?? '';

  const dailyStats = summarizeDaily(intensities);

  // v4 cap-validation diagnostics. Compute concentration of the most-
  // played track and the most-played artist. If caps held during sampling
  // these should land below MAX_TRACK_SHARE and MAX_ARTIST_SHARE.
  const trackTallies = new Map<string, number>();
  const artistTallies = new Map<string, number>();
  const lifecycleByTrack = new Map(lifecycles.map((l) => [l.trackId, l.primaryArtistId]));
  for (const e of events) {
    trackTallies.set(e.trackId, (trackTallies.get(e.trackId) ?? 0) + 1);
    const aid = lifecycleByTrack.get(e.trackId) ?? '';
    if (aid) artistTallies.set(aid, (artistTallies.get(aid) ?? 0) + 1);
  }
  const topTrackPlays = Math.max(0, ...trackTallies.values());
  const topArtistPlays = Math.max(0, ...artistTallies.values());
  const topTrackShare = events.length > 0 ? topTrackPlays / events.length : 0;
  const topArtistShare = events.length > 0 ? topArtistPlays / events.length : 0;

  logger.info(
    {
      userId,
      inserted,
      uniqueTracks: pool.length,
      byRange,
      dailyStats,
      topTrackShare,
      topArtistShare,
      earliestPlay,
      latestPlay,
    },
    'synth: generation complete (v4)'
  );

  return {
    totalPlaysGenerated: inserted,
    uniqueTracks: pool.length,
    earliestPlay,
    latestPlay,
    byRange,
    dailyStats,
    topTrackShare,
    topArtistShare,
  };
}
