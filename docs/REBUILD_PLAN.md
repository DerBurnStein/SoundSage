# SoundSage rebuild blueprint

## Core flow

1. User authenticates with Spotify PKCE.
2. Backend stores encrypted OAuth tokens and user profile metadata.
3. Ingestion route pulls `recently-played` events.
4. Events are upserted with dedupe key: `(user_id, spotify_track_id, played_at)`.
5. Analytics queries summarize behavior over a configurable day window.
6. Dashboard renders KPIs + top tracks/artists + session pattern metrics.
7. Privacy routes allow full export and one-click delete.

## Design decisions

- Keep ingestion idempotent using SQL unique constraint.
- Store token material encrypted at rest.
- Compute most analytics in SQL to keep backend logic simple.
- Keep dashboard API read-optimized (`/summary`, `/recent`).
- Use cascade deletes to make privacy deletion deterministic.

## Next milestones

- Add background sync worker (cron/queue) for automatic ingestion.
- Add timezone-aware insights in user local timezone.
- Persist precomputed daily aggregates for scale.
- Add frontend visual charts (hour heatmap, weekday bars, session timeline).
