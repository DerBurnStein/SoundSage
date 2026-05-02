# SoundSage Implementation Plan (Aligned to `SoundSage_Dev_Handoff.md`)

## Product Definition
SoundSage is a **Spotify analytics layer** that:
- authenticates the app user with **Google Identity Services**,
- connects Spotify using **OAuth + PKCE**,
- ingests and normalizes listening events into a relational database,
- serves dashboard-focused API responses from its own backend.

The frontend should consume SoundSage API endpoints, not raw Spotify payloads.

## Architecture Overview
1. **Identity Layer A (App Identity):** Google Identity Services for SoundSage account/session.
2. **Identity Layer B (Music Data Access):** Spotify OAuth tokens scoped to that SoundSage user.
3. **Ingestion Layer:** background sync that fetches recently played data incrementally.
4. **Storage Layer:** PostgreSQL source of truth (`users`, `oauth/account`, `listening_events`, `ingestion_state`).
5. **Presentation Layer:** dashboard tabs powered by backend aggregates.

## Core Data Model
Minimum schema requirements:
- `users`
  - `id`, `google_subject`, profile metadata, preferences.
- `spotify_accounts` (or `account`)
  - `user_id`, `spotify_user_id`, encrypted `access_token`, encrypted `refresh_token`, `expires_at`, `last_sync_at`, `failure_count`.
- `listening_events`
  - `id`, `user_id`, `spotify_track_id`, `track_name`, `artist_names`, `played_at`, `ms_played`, ingest metadata.
- `ingestion_state`
  - `user_id`, `high_watermark_played_at`, `last_run_started_at`, `last_run_finished_at`, status/error fields.

Recommended constraints:
- Unique dedupe key on `(user_id, spotify_track_id, played_at)`.
- Index on `(user_id, played_at DESC)`.

## Backend Responsibilities
- Google session validation for all authenticated API routes.
- Spotify authorization code + PKCE exchange.
- Secure token storage (encrypt at rest).
- Token refresh before Spotify API requests.
- Incremental sync job:
  - pull `/v1/me/player/recently-played`,
  - skip duplicates,
  - advance ingestion watermark,
  - write observability/sync status.
- Expose dashboard endpoints returning app-defined DTOs.

## API Surface (Suggested)
- `GET /api/me`
- `GET /api/spotify/connection`
- `POST /api/spotify/connect/start`
- `GET /api/spotify/connect/callback`
- `GET /api/sync/status`
- `POST /api/sync/trigger`
- `GET /api/stats/overview`
- `GET /api/stats/activity`
- `GET /api/stats/hourly`
- `GET /api/stats/top-tracks`
- `GET /api/stats/top-artists`
- `GET /api/history/recent`

## Frontend Dashboard Requirements
Per the handoff, include:
- connection status and sync status,
- summary KPI cards,
- recent listening timeline,
- top tracks and top artists,
- daily and hourly behavior patterns.

Use backend DTOs so chart/list components stay presentation-focused.

## Deployment Guidance (Google Cloud Oriented)
- **Frontend:** static hosting (or Next.js hosting) on GCP.
- **Backend API:** Cloud Run.
- **Database:** Cloud SQL Postgres.
- **Worker/Jobs:** Cloud Run jobs or dedicated worker service with scheduler trigger.
- **Secrets:** Secret Manager.

## Delivery Phases
1. **Foundation**
   - project wiring, env management, database migration baseline.
2. **Auth**
   - Google login and protected session.
3. **Spotify Connect**
   - OAuth + PKCE flow and token persistence.
4. **Ingestion MVP**
   - manual trigger sync + dedupe + status endpoint.
5. **Dashboard API**
   - computed aggregates from database.
6. **UI Integration**
   - bind tabs/components to real API data.
7. **Reliability**
   - scheduled syncs, retry/backoff, metrics/logging.

## Immediate Next Build Tasks
- Implement DB schema + migrations for the four core tables.
- Add Google auth for app identity and session-protected API middleware.
- Implement Spotify OAuth callback and encrypted token persistence.
- Build `/api/sync/trigger` + `/api/sync/status` against real ingestion state.
- Replace mock arrays in the dashboard with backend API queries.
