import { prisma } from './prisma.js';

export function logEvent(level, event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...payload }));
}

export async function reportError(err, context = {}) {
  logEvent('error', 'error_reported', { message: String(err), ...context });
  if (process.env.SENTRY_DSN) {
    // Placeholder hook for Sentry/OpenTelemetry exporter integration.
    logEvent('info', 'sentry_placeholder', { context });
  }
}

export async function getOpsDashboardSnapshot() {
  const [failedRuns, recentMetrics, accounts] = await Promise.all([
    prisma.ingestionMetric.count({ where: { status: 'failed', createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    prisma.ingestionMetric.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.spotifyAccount.findMany({ select: { lastSyncAt: true, failureCount: true } }),
  ]);

  const apiLatencyP95Ms = percentile(recentMetrics.map((m) => m.latencyMs), 95);
  const syncFreshnessMinutesP95 = percentile(accounts.map((a) => a.lastSyncAt ? (Date.now() - new Date(a.lastSyncAt).getTime()) / 60000 : 1e9), 95);

  return {
    failedRuns24h: failedRuns,
    apiLatencyP95Ms,
    syncFreshnessMinutesP95,
    sampleSize: recentMetrics.length,
  };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

export function evaluateSLOs(snapshot) {
  const apiLatencyTargetMs = Number(process.env.SLO_API_P95_MS || 500);
  const syncFreshnessTargetMinutes = Number(process.env.SLO_SYNC_FRESHNESS_P95_MIN || 30);
  return {
    targets: { apiLatencyTargetMs, syncFreshnessTargetMinutes },
    status: {
      apiLatency: snapshot.apiLatencyP95Ms === null ? 'unknown' : snapshot.apiLatencyP95Ms <= apiLatencyTargetMs ? 'pass' : 'fail',
      syncFreshness: snapshot.syncFreshnessMinutesP95 === null ? 'unknown' : snapshot.syncFreshnessMinutesP95 <= syncFreshnessTargetMinutes ? 'pass' : 'fail',
    },
  };
}
