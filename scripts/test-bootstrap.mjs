// One-off: call bootstrapTopItems for the only user and print full errors.
// Useful for diagnosing why artist snapshots failed while track snapshots
// succeeded. Safe to delete after the issue is resolved.
//
// Run: DATABASE_URL=... TOKEN_ENCRYPTION_KEY=... SPOTIFY_CLIENT_ID=... \
//      SPOTIFY_CLIENT_SECRET=... node scripts/test-bootstrap.mjs

// We need to import via the Prisma generated path. The lib uses TS but
// `tsx` will compile on the fly.
import { spawn } from 'node:child_process';

const cmd = `npx tsx -e "
import('./lib/spotify-bootstrap.ts').then(async (m) => {
  const userId = 'cmoqma4ve0000g4kuarht26f3';
  console.log('Starting bootstrap for', userId);
  try {
    const res = await m.bootstrapTopItems(userId);
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('FAILED with full stack:');
    console.error(err);
  }
  process.exit(0);
});
"`;
const p = spawn(cmd, { shell: true, stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 0));
