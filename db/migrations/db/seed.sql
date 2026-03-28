INSERT INTO users (id, spotify_id, display_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'spotify_123', 'Test User');

INSERT INTO play_events (user_id, track_id, played_at, track_name, artist_name)
VALUES 
('11111111-1111-1111-1111-111111111111', 'track1', NOW(), 'Song A', 'Artist A'),
('11111111-1111-1111-1111-111111111111', 'track2', NOW() - INTERVAL '1 hour', 'Song B', 'Artist B');
