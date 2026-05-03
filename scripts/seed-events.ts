// Synthesizes a large volume of ListeningEvent rows for a single user, used to
// stress-test the dashboard aggregation queries. Run with `tsx`:
//
//   npx tsx scripts/seed-events.ts <userId> [count=30000]
//
// Idempotent across runs in the sense that the unique index
// (userId, trackId, playedAt) silently dedupes — but we randomize playedAt
// per row so collisions are rare. Drops cached stats for the user so the
// next page load reflects the new data.

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const db = new PrismaClient();

const TRACK_POOL_SIZE = 200; // Number of distinct tracks the synthetic user "listens to"
const ARTIST_POOL_SIZE = 50;
const BATCH_SIZE = 1000;

interface SeedConfig {
  userId: string;
  count: number;
}

function parseArgs(): SeedConfig {
  const userId = process.argv[2];
  const count = parseInt(process.argv[3] ?? '30000', 10);
  if (!userId) {
    console.error('Usage: tsx scripts/seed-events.ts <userId> [count=30000]');
    process.exit(1);
  }
  if (!Number.isFinite(count) || count <= 0) {
    console.error('count must be a positive integer');
    process.exit(1);
  }
  return { userId, count };
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function main() {
  const { userId, count } = parseArgs();

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User ${userId} does not exist. Sign in first to create the row.`);
    process.exit(1);
  }

  console.log(`Seeding ${count} synthetic events for ${userId}...`);

  // Build a small pool of synthetic tracks + artists so the events have
  // realistic-looking groupings (multiple plays per track, repeat artists).
  const artistIds = Array.from({ length: ARTIST_POOL_SIZE }, () =>
    `seed_artist_${randomUUID().slice(0, 12)}`
  );
  const artistNames = artistIds.map((_, i) => `Synth Artist ${i + 1}`);
  const trackPool = Array.from({ length: TRACK_POOL_SIZE }, (_, i) => {
    const artistIndex = i % ARTIST_POOL_SIZE;
    return {
      id: `seed_track_${randomUUID().slice(0, 12)}`,
      name: `Synth Track ${i + 1}`,
      artistIds: [artistIds[artistIndex]!],
      artistNames: [artistNames[artistIndex]!],
      albumName: `Synth Album ${Math.floor(i / 10) + 1}`,
      durationMs: 120_000 + Math.floor(Math.random() * 240_000),
    };
  });

  // Seed Track rows so dashboard joins succeed
  await db.track.createMany({
    data: trackPool.map((t) => ({
      id: t.id,
      name: t.name,
      artistNames: t.artistNames,
      artistIds: t.artistIds,
      albumName: t.albumName,
      durationMs: t.durationMs,
    })),
    skipDuplicates: true,
  });

  // Seed Artist rows with synthetic genres so genres/top-artists endpoints work
  const genrePool = ['rock', 'indie', 'electronic', 'hip hop', 'pop', 'jazz', 'metal', 'folk'];
  await db.artist.createMany({
    data: artistIds.map((id, i) => ({
      id,
      name: artistNames[i]!,
      genres: [
        randomChoice(genrePool),
        randomChoice(genrePool),
      ],
      genresSynced: true,
    })),
    skipDuplicates: true,
  });

  // Spread events across the past 365 days
  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;

  let inserted = 0;
  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, count - batchStart);
    const batch = Array.from({ length: batchSize }, () => {
      const track = randomChoice(trackPool);
      return {
        userId,
        trackId: track.id,
        playedAt: new Date(now - Math.floor(Math.random() * yearMs)),
        msPlayed: null as number | null,
        source: 'recently_played',
      };
    });

    const result = await db.listeningEvent.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;

    if ((batchStart / BATCH_SIZE) % 5 === 0) {
      process.stdout.write(`  ${inserted} / ${count}\r`);
    }
  }

  console.log(`\nDone. Inserted ${inserted} events (duplicates filtered by unique index).`);
  console.log(
    'Drop cached stats for this user so the next dashboard load is from a cold cache:'
  );
  console.log(`  redis-cli --scan --pattern "cache:stats:${userId}:*" | xargs redis-cli del`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
