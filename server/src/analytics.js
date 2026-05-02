function inRange(iso, from) { return new Date(iso) >= from; }

export function getRangeFromParam(range) {
  const now = new Date();
  const map = { '24h': 1, '7d': 7, '4w': 28, '6m': 183, '1y': 365, all: null };
  if (map[range] === null) return new Date(0);
  if (!map[range]) return new Date(now.getTime() - 28 * 24 * 3600_000);
  return new Date(now.getTime() - map[range] * 24 * 3600_000);
}

export function filtered(events, from) {
  return events.filter((e) => inRange(e.playedAt, from));
}

export function overview(events, from) {
  const rows = filtered(events, from);
  const uniqueTracks = new Set(rows.map((e) => e.spotifyTrackId));
  const totalMs = rows.reduce((a, e) => a + e.msPlayed, 0);
  const hourCounts = new Array(24).fill(0);
  rows.forEach((e) => hourCounts[e.hour]++);
  const topHour = hourCounts.indexOf(Math.max(...hourCounts));
  return {
    totalPlays: rows.length,
    uniqueTracks: uniqueTracks.size,
    totalMs,
    topHour,
    newArtists: new Set(rows.map((e) => e.artistNames[0])).size,
    discoveryRate: rows.length ? uniqueTracks.size / rows.length : 0,
    range: { from: from.toISOString(), to: new Date().toISOString() },
  };
}

export function hourly(events, from) {
  const buckets = new Array(24).fill(0);
  filtered(events, from).forEach((e) => buckets[e.hour]++);
  return { buckets: buckets.map((plays, hour) => ({ hour, plays })) };
}

export function activity(events, from, grain = 'day') {
  const map = new Map();
  for (const e of filtered(events, from)) {
    const d = new Date(e.playedAt);
    const key = grain === 'week'
      ? `${d.getUTCFullYear()}-W${Math.floor((d.getUTCDate() - 1) / 7) + 1}`
      : d.toISOString().slice(0, 10);
    const prev = map.get(key) || { t: d.toISOString().slice(0, 10), plays: 0, mins: 0 };
    prev.plays += 1;
    prev.mins += Math.round(e.msPlayed / 60000);
    map.set(key, prev);
  }
  return { grain, buckets: [...map.values()].sort((a, b) => a.t.localeCompare(b.t)) };
}

export function genres(events, from, limit = 8) {
  const rows = filtered(events, from);
  const total = rows.length || 1;
  const counts = new Map();
  rows.forEach((e) => counts.set(e.genre, (counts.get(e.genre) || 0) + 1));
  const out = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, plays]) => ({ name, plays, share: plays / total }));
  return { genres: out };
}

export function weekly(events) {
  const minsByWeek = new Array(12).fill(0);
  const now = Date.now();
  events.forEach((e) => {
    const ageDays = (now - new Date(e.playedAt).getTime()) / (24 * 3600_000);
    const idx = 11 - Math.floor(ageDays / 7);
    if (idx >= 0 && idx < 12) minsByWeek[idx] += Math.round(e.msPlayed / 60000);
  });
  return { weeks: minsByWeek };
}

export function topTracks(events, from, limit = 20) {
  const rows = filtered(events, from);
  const map = new Map();
  for (const e of rows) {
    const key = e.spotifyTrackId;
    const curr = map.get(key) || { id: key, name: e.trackName, plays: 0, totalMs: 0, lastPlayedAt: e.playedAt, artist: e.artistNames[0] };
    curr.plays += 1;
    curr.totalMs += e.msPlayed;
    if (e.playedAt > curr.lastPlayedAt) curr.lastPlayedAt = e.playedAt;
    map.set(key, curr);
  }
  const tracks = [...map.values()].sort((a, b) => b.plays - a.plays).slice(0, limit).map((t) => ({
    id: t.id,
    name: t.name,
    artists: [{ id: t.artist.toLowerCase().replace(/\s+/g, '_'), name: t.artist }],
    album: { id: 'album_demo', name: 'Demo Album', imageUrl: null },
    plays: t.plays,
    totalMs: t.totalMs,
    lastPlayedAt: t.lastPlayedAt,
  }));
  return { tracks };
}

export function topArtists(events, from, limit = 20) {
  const rows = filtered(events, from);
  const total = rows.length || 1;
  const map = new Map();
  for (const e of rows) {
    const key = e.artistNames[0];
    const curr = map.get(key) || { id: key.toLowerCase().replace(/\s+/g, '_'), name: key, plays: 0, tracks: new Set(), genres: new Set() };
    curr.plays += 1;
    curr.tracks.add(e.spotifyTrackId);
    curr.genres.add(e.genre);
    map.set(key, curr);
  }
  const artists = [...map.values()].sort((a, b) => b.plays - a.plays).slice(0, limit).map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: null,
    genres: [...a.genres],
    plays: a.plays,
    uniqueTracks: a.tracks.size,
    share: a.plays / total,
  }));
  return { artists };
}
