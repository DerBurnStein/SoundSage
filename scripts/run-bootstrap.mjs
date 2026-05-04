// Force-runs bootstrapTopItems for a single user. Streams output as it goes
// so we can see which range/operation is hanging if anything stalls.
//
// Run: $env:DATABASE_URL=...; $env:TOKEN_ENCRYPTION_KEY=...; \
//      $env:SPOTIFY_CLIENT_ID=...; $env:SPOTIFY_CLIENT_SECRET=...; \
//      npx tsx scripts/run-bootstrap.mjs <userId>

const userId = process.argv[2] ?? 'cmoqma4ve0000g4kuarht26f3';

console.log(`[${new Date().toISOString()}] starting bootstrap for ${userId}`);
const t0 = Date.now();

try {
  const mod = await import('../lib/spotify-bootstrap.ts');
  console.log(`[${new Date().toISOString()}] module loaded (+${Date.now() - t0}ms)`);
  const res = await mod.bootstrapTopItems(userId);
  console.log(`[${new Date().toISOString()}] SUCCESS (+${Date.now() - t0}ms):`);
  console.log(JSON.stringify(res, null, 2));
} catch (err) {
  console.error(`[${new Date().toISOString()}] FAILED (+${Date.now() - t0}ms):`);
  console.error(err);
  process.exit(1);
}
process.exit(0);
