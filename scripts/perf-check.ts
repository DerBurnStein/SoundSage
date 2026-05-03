// Hammers each dashboard endpoint repeatedly and reports latency percentiles.
// Useful for verifying the p95 < 300ms target on a 30k-event seeded user.
//
// Usage:
//   npx tsx scripts/perf-check.ts <cookie>
//
// Where <cookie> is the value of `authjs.session-token` from your browser
// (open DevTools → Storage → Cookies on http://localhost:3000). The cookie
// authenticates the perf calls as a real user.
//
// Run after `seed-events.ts` to test against a 30k-event corpus, AFTER first
// flushing the stats cache so we measure a cold path:
//   redis-cli FLUSHDB

interface EndpointTest {
  name: string;
  path: string;
}

const ENDPOINTS: EndpointTest[] = [
  { name: 'overview-4w', path: '/api/stats/overview?range=4w' },
  { name: 'overview-1y', path: '/api/stats/overview?range=1y' },
  { name: 'activity-4w', path: '/api/stats/activity?range=4w' },
  { name: 'hourly-4w', path: '/api/stats/hourly?range=4w' },
  { name: 'weekly', path: '/api/stats/weekly' },
  { name: 'genres-4w', path: '/api/stats/genres?range=4w' },
  { name: 'tracks-top-4w', path: '/api/tracks/top?range=4w&limit=20' },
  { name: 'artists-top-4w', path: '/api/artists/top?range=4w&limit=20' },
  { name: 'history-recent', path: '/api/history/recent?limit=50' },
];

const ITERATIONS = 100;
const BASE_URL = 'http://localhost:3000';

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function fmt(ms: number): string {
  return `${ms.toFixed(0).padStart(5)}ms`;
}

async function timeOnce(path: string, cookie: string): Promise<{ ms: number; status: number }> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Cookie: `authjs.session-token=${cookie}` },
    cache: 'no-store',
  });
  await res.text(); // drain body so timing includes parse
  return { ms: performance.now() - start, status: res.status };
}

async function main() {
  const cookie = process.argv[2];
  if (!cookie) {
    console.error('Usage: tsx scripts/perf-check.ts <session-cookie>');
    process.exit(1);
  }

  console.log(`Running ${ITERATIONS} iterations per endpoint...\n`);

  const header = ['endpoint', 'min', 'p50', 'p95', 'p99', 'max', 'errors'];
  console.log(header.map((h) => h.padEnd(10)).join(''));
  console.log('─'.repeat(70));

  for (const ep of ENDPOINTS) {
    const samples: number[] = [];
    let errors = 0;

    // Warm-up call (excluded from samples)
    await timeOnce(ep.path, cookie).catch(() => {});

    for (let i = 0; i < ITERATIONS; i++) {
      try {
        const { ms, status } = await timeOnce(ep.path, cookie);
        if (status >= 400) {
          errors++;
        } else {
          samples.push(ms);
        }
      } catch {
        errors++;
      }
    }

    if (samples.length === 0) {
      console.log(`${ep.name.padEnd(20)} ${'(all errored)'.padEnd(50)} ${errors}`);
      continue;
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const p99 = percentile(samples, 99);

    console.log(
      `${ep.name.padEnd(20)} ${fmt(min)} ${fmt(p50)} ${fmt(p95)} ${fmt(p99)} ${fmt(max)} ${String(errors).padEnd(8)}`
    );
  }

  console.log('\nTarget: p95 < 300ms cold cache. Cached responses should be <50ms.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
