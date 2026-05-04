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
console.log(`\nTop 10 tracks (v4 cap: top should be <= ${Math.floor(totalEvents * 0.04)} = 4% of total):`);
for (const t of topTracks) {
  const share = ((t.plays / totalEvents) * 100).toFixed(2);
  console.log(`  ${t.plays.toString().padStart(4)} plays (${share}%)  ${t.name} — ${t.artistNames?.[0] ?? '(no artist)'}`);
}
console.log(`\nTop 5 heaviest days (v4 cap = 75 plays/day):`);
for (const d of dailyStats) {
  console.log(`  ${d.plays.toString().padStart(4)} plays  ${d.day.toISOString().slice(0, 10)}`);
}

// Top 5 artists for cap verification
const topArtists = await db.$queryRawUnsafe(`
  SELECT t."artistNames"[1] AS artist, COUNT(*)::int AS plays
  FROM listening_events e
  LEFT JOIN tracks t ON t.id = e."trackId"
  WHERE e."userId" = $1 AND e.source = 'synthetic'
  GROUP BY artist
  ORDER BY plays DESC
  LIMIT 5
`, userId);
console.log(`\nTop 5 artists (v4 cap: top should be <= ${Math.floor(totalEvents * 0.38)} = 38% of total):`);
for (const a of topArtists) {
  const share = ((a.plays / totalEvents) * 100).toFixed(2);
  console.log(`  ${a.plays.toString().padStart(4)} plays (${share}%)  ${a.artist ?? '(no artist)'}`);
}

// Daily distribution histogram for variance verification
const dailyDist = await db.$queryRawUnsafe(`
  SELECT
    PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY plays)::int AS p10,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY plays)::int AS p50,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY plays)::int AS p90,
    MIN(plays) AS min, MAX(plays) AS max,
    COUNT(*) FILTER (WHERE plays = 0) AS zero_days,
    COUNT(*) FILTER (WHERE plays >= 60) AS heavy_days
  FROM (
    SELECT DATE_TRUNC('day', e."playedAt") AS day, COUNT(*)::int AS plays
    FROM listening_events e
    WHERE e."userId" = $1 AND e.source = 'synthetic'
    GROUP BY day
  ) AS daily
`, userId);
console.log(`\nDaily play distribution (v4 should show real variance, NOT a flat plateau):`);
console.log(`  p10=${dailyDist[0].p10} p50=${dailyDist[0].p50} p90=${dailyDist[0].p90} min=${dailyDist[0].min} max=${dailyDist[0].max}`);
console.log(`  heavy days (>=60): ${dailyDist[0].heavy_days}, (stat: zero days: ${dailyDist[0].zero_days})`);

await db.$disconnect();
