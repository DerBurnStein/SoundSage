// Seeds the public demo user (DEMO_USER_ID = 'demo-public-2026') with a
// realistic set of synthetic data so unauthenticated visitors hitting
// /demo/start land on a populated dashboard.
//
// Approach: copy the snapshot rows + listening events from a real
// "source" user into the demo user. We don't generate fresh synthetic
// data here because doing so would require a live Spotify token, and
// the demo user has none. The real user we're cloning from has already
// been bootstrapped + had v4 synthetic generation run against them,
// so their data is exactly the shape we want.
//
// All events copied are forced to source='synthetic' regardless of
// what they had on the source — this keeps the demo data
// distinguishable in the DB and ensures any future real-user import
// path that runs `deleteMany({ source: 'synthetic' })` would clean it
// up if accidentally pointed at the demo user.
//
// Run: $env:DATABASE_URL=...; npx tsx scripts/seed-demo-user.mjs <sourceUserId>
//   (sourceUserId defaults to the dev user if omitted)

import { PrismaClient } from '@prisma/client';

const DEMO_USER_ID = 'demo-public-2026';
const SOURCE_USER_ID = process.argv[2] ?? 'cmoqma4ve0000g4kuarht26f3';

const db = new PrismaClient();

console.log(`[seed-demo] copying from ${SOURCE_USER_ID} → ${DEMO_USER_ID}`);

// 1. Upsert User. Onboarding flagged complete with choice='synthetic' so
// the OnboardingModal won't auto-open for demo visitors.
await db.user.upsert({
  where: { id: DEMO_USER_ID },
  create: {
    id: DEMO_USER_ID,
    name: 'Demo Visitor',
    email: 'demo@soundsage.dev',
    onboardingCompletedAt: new Date(),
    onboardingChoice: 'synthetic',
  },
  update: {
    name: 'Demo Visitor',
    onboardingCompletedAt: new Date(),
    onboardingChoice: 'synthetic',
  },
});
console.log('[seed-demo] user upserted');

// 2. Fake SpotifyAccount row so the dashboard's "connected" check
// passes. The token fields are placeholder strings — they will never
// be decrypted because all write/sync paths reject demo sessions
// before hitting ensureFreshToken().
await db.spotifyAccount.upsert({
  where: { userId: DEMO_USER_ID },
  create: {
    userId: DEMO_USER_ID,
    spotifyUserId: 'demo-spotify-account',
    displayName: 'Demo Visitor',
    imageUrl: null,
    // Encrypted-token columns are non-null in the schema. We store a
    // sentinel string that will never decrypt successfully — anything
    // attempting to use it crashes before making real API calls.
    accessToken: 'demo:placeholder',
    refreshToken: 'demo:placeholder',
    expiresAt: new Date(Date.now() + 365 * 86_400_000),
    scopes: 'user-read-recently-played user-read-currently-playing user-top-read',
    needsReconnect: false,
    failureCount: 0,
    lastSyncAt: new Date(),
    cursor: new Date(),
  },
  update: {
    displayName: 'Demo Visitor',
    needsReconnect: false,
    lastSyncAt: new Date(),
  },
});
console.log('[seed-demo] spotify account upserted');

// 3. Wipe any prior demo data, then copy. Doing this in one transaction
// means the dashboard never sees a half-seeded state.
await db.$transaction(async (tx) => {
  await tx.listeningEvent.deleteMany({ where: { userId: DEMO_USER_ID } });
  await tx.topTrackSnapshot.deleteMany({ where: { userId: DEMO_USER_ID } });
  await tx.topArtistSnapshot.deleteMany({ where: { userId: DEMO_USER_ID } });
});
console.log('[seed-demo] cleared prior demo rows');

// 4. Copy top-track snapshots. The Track table is shared (one row per
// Spotify track ID) so we reuse rows by reference — no need to copy.
const trackSnaps = await db.topTrackSnapshot.findMany({
  where: { userId: SOURCE_USER_ID },
});
if (trackSnaps.length > 0) {
  await db.topTrackSnapshot.createMany({
    data: trackSnaps.map((s) => ({
      userId: DEMO_USER_ID,
      range: s.range,
      rank: s.rank,
      trackId: s.trackId,
    })),
  });
}
console.log(`[seed-demo] copied ${trackSnaps.length} top-track snapshots`);

const artistSnaps = await db.topArtistSnapshot.findMany({
  where: { userId: SOURCE_USER_ID },
});
if (artistSnaps.length > 0) {
  await db.topArtistSnapshot.createMany({
    data: artistSnaps.map((s) => ({
      userId: DEMO_USER_ID,
      range: s.range,
      rank: s.rank,
      artistId: s.artistId,
    })),
  });
}
console.log(`[seed-demo] copied ${artistSnaps.length} top-artist snapshots`);

// 5. Copy listening events in batches. The source user has ~14k events;
// chunked inserts keep memory and Prisma transaction limits sane.
const BATCH = 1000;
let copied = 0;
let skip = 0;
while (true) {
  const events = await db.listeningEvent.findMany({
    where: { userId: SOURCE_USER_ID },
    select: { trackId: true, playedAt: true, msPlayed: true },
    orderBy: { id: 'asc' },
    skip,
    take: BATCH,
  });
  if (events.length === 0) break;

  await db.listeningEvent.createMany({
    data: events.map((e) => ({
      userId: DEMO_USER_ID,
      trackId: e.trackId,
      playedAt: e.playedAt,
      msPlayed: e.msPlayed,
      // Force source='synthetic' regardless of what the source had,
      // so demo events are uniformly tagged.
      source: 'synthetic',
    })),
    skipDuplicates: true,
  });
  copied += events.length;
  skip += BATCH;
  console.log(`[seed-demo] copied ${copied} events so far...`);
}

console.log(`[seed-demo] done — ${copied} events total`);
await db.$disconnect();
