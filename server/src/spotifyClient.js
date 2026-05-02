export async function fetchRecentlyPlayed(accessToken, afterMs) {
  const params = new URLSearchParams({ limit: '50' });
  if (afterMs) params.set('after', String(afterMs));

  const r = await fetch(`https://api.spotify.com/v1/me/player/recently-played?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Spotify recently-played failed: ${r.status} ${txt}`);
  }

  return r.json();
}

export function normalizeRecentlyPlayedItem(item) {
  return {
    spotifyTrackId: item.track.id,
    trackName: item.track.name,
    artistNames: item.track.artists.map((a) => a.name),
    playedAt: item.played_at,
    msPlayed: item.track.duration_ms,
    genre: null,
  };
}
