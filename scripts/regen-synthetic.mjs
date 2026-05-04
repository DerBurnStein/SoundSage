// Regenerate synthetic data for a single user and print a distribution
// summary so we can verify the new engine produces realistic patterns.
//
// Run: $env:DATABASE_URL=...; $env:TOKEN_ENCRYPTION_KEY=...; \
//      $env:SPOTIFY_CLIENT_ID=...; $env:SPOTIFY_CLIENT_SECRET=...; \
//      npx tsx scripts/regen-synthetic.mjs <userId>

const userId = process.argv[2] ?? 'cmoqma4ve0000g4kuarht26f3';

console.log(`[${new Date().toISOString()}] regen-synthetic for ${userId}`);
const t0 = Date.now();

const synth = await import('../lib/synthetic-history.ts');
const result = await synth.generateSyntheticHistory(userId);
console.log(`[${new Date().toISOString()}] generated (+${Date.now() - t0}ms):`);
console.log(JSON.stringify(result, null, 2));

// Verify distribution
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();

const [topTracks, dailyStats, totalEvents] = await Promise.all([
  db.$queryRawUnsafe(`
    SELECT e."trackId", t.name, t."artistNames", COUNT(*)::int as plays
    FROM listening_events e
    LEFT JOIN tracks t ON t.id = e."trackId"
    WHERE e."userId" = $1 AND e.source = 'synthetic'
    GROUP BY e."trackId", t.name, t."artistNames"
    ORDER BY plays DESC
    LIMIT 10
  `, userId),
  db.$queryRawUnsafe(`
    SELECT DATE_TRUNC('day', e."playedAt") as day, COUNT(*)::int as plays
    FROM listening_events e
    WHERE e."userId" = $1 AND e.source = 'synthetic'
    GROUP BY day
    ORDER BY plays DESC
    LIMIT 5
  `, userId),
  db.listeningEvent.count({ where: { userId, source: 'synthetic' } }),
]);

console.log(`\nTotal synthetic events: ${totalEvents}`);
console.log(`\nTop 10 tracks (real Zipf curve should show #1 ≈ 3-4× #5):`);
for (const t of topTracks) {
  console.log(`  ${t.plays.toString().padStart(4)} plays  ${t.name} — ${t.artistNames?.[0] ?? '(no artist)'}`);
}
console.log(`\nTop 5 heaviest days (should NOT exceed 80):`);
for (const d of dailyStats) {
  console.log(`  ${d.plays.toString().padStart(4)} plays  ${d.day.toISOString().slice(0, 10)}`);
}

await db.$disconnect();
