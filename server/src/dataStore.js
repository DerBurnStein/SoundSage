const now = new Date();

function isoAgo(hours) {
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

export const db = {
  users: [{ id: 'u1', googleSub: 'google-demo-123', displayName: 'Demo Listener' }],
  spotifyAccounts: [{
    userId: 'u1',
    spotifyUserId: 'spotify_demo',
    connected: true,
    lastSyncAt: isoAgo(2),
    cursor: isoAgo(2),
    failureCount: 0,
    tokenState: 'expired',
    expiresAt: null,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    scopeValid: false,
    scopeMissing: [],
    grantedScopes: [],
  }],
  ingestionState: [{ userId: 'u1', highWatermarkPlayedAt: isoAgo(2), status: 'idle' }],
  listeningEvents: Array.from({ length: 120 }).map((_, i) => {
    const playedAt = new Date(now.getTime() - i * 3600_000);
    const hour = playedAt.getUTCHours();
    return {
      id: String(i + 1),
      userId: 'u1',
      spotifyTrackId: `track_${(i % 12) + 1}`,
      trackName: `Track ${(i % 12) + 1}`,
      artistNames: [`Artist ${(i % 5) + 1}`],
      playedAt: playedAt.toISOString(),
      msPlayed: 180000 + (i % 4) * 30000,
      genre: ['Indie', 'R&B', 'Folk', 'Pop', 'Ambient'][i % 5],
      hour,
    };
  }),
};
