CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_id TEXT UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE oauth_tokens (
  user_id UUID REFERENCES users(id),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (user_id)
);

CREATE TABLE play_events (
  user_id UUID REFERENCES users(id),
  track_id TEXT,
  played_at TIMESTAMPTZ,
  track_name TEXT,
  artist_name TEXT,
  PRIMARY KEY (user_id, track_id, played_at)
);

CREATE TABLE ingestion_state (
  user_id UUID REFERENCES users(id),
  last_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  PRIMARY KEY (user_id)
);
