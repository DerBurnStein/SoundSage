// SoundSage — health endpoint
// Cloud Run readiness/liveness probe target. Pings Postgres + Redis with
// short timeouts and returns:
//   • 200 + JSON status when both reachable.
//   • 503 + JSON status when either is degraded — Cloud Run will then
//     hold traffic off this instance until the next probe succeeds.
//
// Unauthenticated by design: this is meant to be hit by infra (probes,
// uptime monitors), not users. It does NOT reveal user data — only the
// boolean reachability of the two backing services.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

// Make sure Cloud Run's prober always gets a fresh answer; never cache.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROBE_TIMEOUT_MS = 1500;

interface HealthBody {
  status: 'ok' | 'degraded';
  uptime: number;          // seconds since this instance booted
  checks: {
    db:    { ok: boolean; latencyMs?: number; error?: string };
    redis: { ok: boolean; latencyMs?: number; error?: string };
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timeout > ${ms}ms`)), ms)
    ),
  ]);
}

async function probeDb(): Promise<HealthBody['checks']['db']> {
  const start = Date.now();
  try {
    // SELECT 1 is the cheapest possible touch — no row scan, no planner work.
    await withTimeout(db.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 200) };
  }
}

async function probeRedis(): Promise<HealthBody['checks']['redis']> {
  const start = Date.now();
  try {
    const reply = await withTimeout(redis.ping(), PROBE_TIMEOUT_MS);
    if (reply !== 'PONG') {
      return { ok: false, error: `unexpected reply: ${String(reply)}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 200) };
  }
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  const [dbCheck, redisCheck] = await Promise.all([probeDb(), probeRedis()]);
  const allOk = dbCheck.ok && redisCheck.ok;

  const body: HealthBody = {
    status: allOk ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    checks: { db: dbCheck, redis: redisCheck },
  };

  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      // Belt-and-braces against any intermediary cache.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
