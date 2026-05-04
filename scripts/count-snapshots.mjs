// One-off diagnostic: count snapshot rows + show Spotify account state.
// Run via: DATABASE_URL=... node scripts/count-snapshots.mjs
// Safe to delete after the bootstrap question is resolved.

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const [tracks, artists, accts, events] = await Promise.all([
  db.topTrackSnapshot.count(),
  db.topArtistSnapshot.count(),
  db.spotifyAccount.findMany({
    select: { userId: true, lastSyncAt: true, cursor: true, needsReconnect: true, failureCount: true },
  }),
  db.listeningEvent.count(),
]);

console.log('top_track_snapshots:', tracks);
console.log('top_artist_snapshots:', artists);
console.log('listening_events:', events);
console.log('spotify_accounts:', JSON.stringify(accts, null, 2));

await db.$disconnect();
