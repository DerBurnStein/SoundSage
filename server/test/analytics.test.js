import assert from 'assert';
import { overview, hourly, activity, genres, topTracks, topArtists, getRangeFromParam } from '../src/analytics.js';

const now = new Date();
const iso = (h) => new Date(now.getTime() - h * 3600_000).toISOString();

const events = [
  { spotifyTrackId: 't1', trackName: 'A', artistNames: ['X'], playedAt: iso(1), msPlayed: 180000, genre: 'Indie', hour: 10 },
  { spotifyTrackId: 't1', trackName: 'A', artistNames: ['X'], playedAt: iso(2), msPlayed: 180000, genre: 'Indie', hour: 10 },
  { spotifyTrackId: 't2', trackName: 'B', artistNames: ['Y'], playedAt: iso(3), msPlayed: 240000, genre: 'Pop', hour: 14 },
];

const from = getRangeFromParam('7d');
assert.equal(overview(events, from).totalPlays, 3);
assert.equal(hourly(events, from).buckets[10].plays, 2);
assert.equal(activity(events, from, 'day').buckets.length >= 1, true);
assert.equal(genres(events, from).genres.length, 2);
assert.equal(topTracks(events, from, 1).tracks[0].id, 't1');
assert.equal(topArtists(events, from, 1).artists[0].name, 'X');

console.log('analytics tests passed');
