CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_subject TEXT UNIQUE,
  spotify_user_id TEXT UNIQUE,
  display_name TEXT,
  email TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT,
  product_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_identity_provider_check CHECK (
    google_subject IS NOT NULL OR spotify_user_id IS NOT NULL
  )
);

CREATE TABLE oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE play_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  played_at TIMESTAMPTZ NOT NULL,
  track_name TEXT NOT NULL,
  artist_names TEXT[] NOT NULL,
  album_name TEXT,
  duration_ms INTEGER,
  context_uri TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, spotify_track_id, played_at)
);

CREATE INDEX idx_play_events_user_played_at ON play_events (user_id, played_at DESC);
CREATE INDEX idx_play_events_user_track ON play_events (user_id, spotify_track_id);

CREATE TABLE ingestion_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_played_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  total_events_ingested INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  event_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_started ON user_sessions (user_id, started_at DESC);
