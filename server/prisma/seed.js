import { prisma } from '../src/prisma.js';

async function main() {
  const user = await prisma.user.upsert({
    where: { googleSub: 'google-seed-user' },
    update: {},
    create: {
      googleSub: 'google-seed-user',
      displayName: 'Seed User',
      account: { create: { spotifyUserId: 'spotify_seed_user', accessToken: '', refreshToken: '', expiresAt: new Date(0), connected: false } },
      ingestion: { create: { status: 'idle' } },
    },
  });

  await prisma.listeningEvent.createMany({
    data: Array.from({ length: 24 }).map((_, i) => ({
      userId: user.id,
      spotifyTrackId: `seed_track_${i % 6}`,
      trackName: `Seed Track ${i % 6}`,
      artistNames: [ `Seed Artist ${i % 3}` ],
      playedAt: new Date(Date.now() - i * 3600_000),
      msPlayed: 180000,
      genre: ['Indie', 'Pop', 'R&B'][i % 3],
    })),
    skipDuplicates: true,
  });

  console.log('seed complete');
}

main().finally(async () => prisma.$disconnect());
