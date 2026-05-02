# SoundSage

SoundSage now uses Prisma + PostgreSQL persistence with a queue-backed ingestion worker.

## Backend setup
```bash
cd server
npm install
export DATABASE_URL='postgresql://user:pass@localhost:5432/soundsage'
export GOOGLE_CLIENT_ID='...'
export SPOTIFY_CLIENT_ID='...'
export SPOTIFY_CLIENT_SECRET='...'
export SPOTIFY_REDIRECT_URI='http://localhost:8080/api/spotify/connect/callback'
export REDIS_HOST='127.0.0.1'
export REDIS_PORT='6379'
npm run generate
npm run migrate:dev
npm run seed
```

## Run services
```bash
# API
npm start

# Ingestion worker (BullMQ consumer)
npm run worker

# Scheduler (enqueue jobs every 15 minutes)
npm run scheduler
```

## Ingestion architecture
- Manual trigger endpoint (`POST /api/sync/trigger`) enqueues a BullMQ job.
- Scheduler enqueues connected users every 15 minutes.
- Worker performs incremental Spotify recently-played pull using ingestion high-water mark.
- Retries use exponential backoff (`attempts: 5`, `backoff: 5s exponential`).
- Final-attempt failures are written to a dead-letter queue.
- Each run writes ingestion metrics (`latencyMs`, `insertedCount`, `receivedCount`, `status`, `error`) for observability.

## DB guarantees
- Dedupe enforced by unique constraint: `(userId, spotifyTrackId, playedAt)`.
- Indexes exist for:
  - user + playedAt DESC
  - user + track
  - user + genre
  - ingestion metrics by user/time and status/time

## Security + compliance controls
- **Token encryption at rest**: Spotify access/refresh tokens are encrypted before persistence using:
  - Google Cloud KMS when `GCP_KMS_KEY_NAME` is configured.
  - AES-256-GCM local fallback otherwise.
- **OAuth replay/CSRF protection**:
  - state is stored hashed (`SHA-256`) with one-time consume semantics.
  - signed, secure, httpOnly nonce cookie (`ss_oauth_nonce`) is required on callback.
  - OAuth state records expire after 10 minutes.
- **Secure cookie/session posture**:
  - `secure`, `httpOnly`, `sameSite=lax`, signed cookies.
  - trusted proxy enabled for secure-cookie deployments.
- **Rate limiting / abuse controls**:
  - global request limiter.
  - stricter auth/OAuth limiter for connect flow.
- **CORS allowlist**:
  - `CORS_ALLOWLIST` env var enforces per-origin allowlist; no permissive wildcard mode.

## Observability + operations
- **Structured logs** are emitted as JSON with `ts`, `level`, `event`, and correlation context.
- **Error monitoring hooks**:
  - `reportError(...)` centralizes error capture.
  - optional Sentry integration point via `SENTRY_DSN`.
- **Health split**:
  - `GET /health/live` (liveness)
  - `GET /health/ready` (readiness checks DB)
  - `GET /healthz` (composite health)
- **Ops dashboard endpoint**:
  - `GET /ops/dashboard` returns recent ingestion/latency snapshot + SLO evaluation.
- **Alerting**:
  - failed sync runs and token refresh-related errors trigger alert pipeline.
  - webhook delivery via `ALERT_WEBHOOK_URL`.
- **SLOs (env-configurable)**:
  - `SLO_API_P95_MS` (default 500ms)
  - `SLO_SYNC_FRESHNESS_P95_MIN` (default 30min)

## Test coverage expansion
### API integration tests
- `server/test/api.integration.test.js`
  - auth-protected endpoint behavior (with test bypass)
  - validation negative paths
  - history pagination contract
- `server/test/oauth.flow.test.js`
  - OAuth callback missing params/state mismatch path
  - refresh failure path

### DB integration tests
- `server/test/db.integration.test.js`
  - dedupe uniqueness behavior
  - cursor update behavior
  - auto-skips when `DATABASE_URL` is unset.

### E2E dashboard tests
- `tests/e2e/dashboard.spec.ts`
  - verifies each tab route renders
  - verifies time-range query behavior in URL

Run:
```bash
cd server && npm test
npm run test:e2e
```
