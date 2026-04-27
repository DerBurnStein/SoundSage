# SoundSage (Rebuild)

SoundSage is a Spotify-connected listening habits dashboard.

This rebuild treats SoundSage as a **data pipeline first** product:

1. Connect Spotify with OAuth PKCE.
2. Ingest listening events over time (incremental sync).
3. Store normalized, deduplicated data.
4. Compute behavior insights (time-of-day, weekday patterns, sessions, top artists/tracks).
5. Render a clean personal dashboard.
6. Let users export/delete their data.

## Product goals

- Move beyond “recently played” into repeatable habits.
- Turn raw play events into explainable insights.
- Preserve user trust with explicit privacy controls.

## Architecture

- `server/` — Express API for auth, ingest, insights, privacy.
- `client/` — React components/pages for connection + dashboard UX.
- `db/` — PostgreSQL schema and migrations for long-term storage.

## API surface

- `GET /auth/spotify/login` — start OAuth flow.
- `GET /auth/spotify/callback` — exchange code, persist token, create session.
- `GET /auth/spotify/me` — current authenticated user summary.
- `POST /auth/spotify/logout` — end session.
- `POST /api/ingest/recent` — pull recent listens and upsert events.
- `GET /api/dashboard/summary?days=30` — dashboard KPIs + trend insights.
- `GET /api/dashboard/recent?limit=25` — recent play events.
- `GET /api/privacy/export` — JSON export of stored user data.
- `DELETE /api/privacy/delete` — delete user and all stored data.

## Local setup (high-level)

1. Create PostgreSQL database and run `db/migrations/001_init.sql`.
2. Configure `.env` with Spotify and database variables.
3. Run the backend and frontend apps.
4. Connect Spotify, trigger ingest, view dashboard insights.


## Backend run (local)

```bash
cd server
npm install
npm run dev
```

The API defaults to port `8080` for Cloud Run compatibility (override with `PORT`).

## Google Cloud deployment

A Cloud Run deployment path is included:

- `Dockerfile` for the backend container
- `cloudbuild.yaml` for image builds in Cloud Build
- `docs/DEPLOY_GCP.md` for step-by-step deployment


## Google Identity Services compatibility

SoundSage now supports Google Identity Services (GIS) account creation/sign-in as a first-party identity layer.

- Backend endpoint: `POST /auth/google/login` (expects GIS ID token `credential`)
- Verified Google identity is stored on `users.google_subject` and can be linked with Spotify later
- Spotify callback links to the currently authenticated session user when present

## Environment variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `SPOTIFY_CLIENT_ID`
- `GOOGLE_CLIENT_ID`
- `SPOTIFY_REDIRECT_URI`
- `SPOTIFY_FRONTEND_CALLBACK_URL`
- `CLIENT_ORIGIN` (defaults to `http://127.0.0.1:5173`)
- `VITE_API_BASE_URL` (frontend env, defaults to `http://127.0.0.1:8080`)
- `VITE_GOOGLE_CLIENT_ID` (frontend GIS client id)

## Why this rebuild

The previous repository state proved authentication basics. This rebuild introduces the missing core: durable ingestion, analytics queries, and privacy operations that make SoundSage useful over time.
