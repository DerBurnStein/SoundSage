import React, { useEffect, useMemo, useState } from 'react';
import ConnectedAccountCard, { type ConnectedUser } from '../components/ConnectedAccountCard';
import DashboardSummary from '../components/DashboardSummary';

type AuthMeResponse = {
  authenticated: boolean;
  user?: ConnectedUser;
};

type SummaryResponse = {
  totals: {
    plays: number;
    distinctTracks: number;
    distinctArtists: number;
  };
  busiestHourUtc: number | null;
  busiestWeekdayUtc: number | null;
  averageSessionLengthMinutes: number;
  topTracks: Array<{ trackName: string; plays: number }>;
  topArtists: Array<{ artistName: string; plays: number }>;
};

const apiBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';

export default function SpotifyCallbackPage() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Finishing Spotify login...');
  const [user, setUser] = useState<ConnectedUser | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    const queryStatus = search.get('status');
    const queryMessage = search.get('message');

    if (queryStatus === 'error') {
      setStatus('error');
      setMessage(queryMessage ?? 'Spotify login failed');
      return;
    }

    (async () => {
      try {
        const authResponse = await fetch(`${apiBase}/auth/spotify/me`, { credentials: 'include' });
        const authData = (await authResponse.json()) as AuthMeResponse;

        if (!authData.authenticated || !authData.user) {
          setStatus('error');
          setMessage('Spotify login did not complete successfully.');
          return;
        }

        setUser(authData.user);

        await fetch(`${apiBase}/api/ingest/recent`, {
          method: 'POST',
          credentials: 'include'
        });

        const summaryResponse = await fetch(`${apiBase}/api/dashboard/summary?days=30`, {
          credentials: 'include'
        });

        const summaryData = (await summaryResponse.json()) as SummaryResponse;
        setSummary(summaryData);
        setStatus('success');
        setMessage(`Connected as ${authData.user.displayName ?? authData.user.spotifyUserId ?? 'SoundSage user'}`);
      } catch {
        setStatus('error');
        setMessage('Could not verify Spotify session.');
      }
    })();
  }, [search]);

  const handleLogout = async () => {
    await fetch(`${apiBase}/auth/spotify/logout`, {
      method: 'POST',
      credentials: 'include'
    });

    setUser(null);
    setSummary(null);
    setStatus('success');
    setMessage('Disconnected from Spotify');
  };

  return (
    <main>
      <h2>SoundSage Dashboard</h2>
      <p>{message}</p>
      {status === 'loading' ? <p>Loading...</p> : null}
      {status === 'success' && user ? <ConnectedAccountCard user={user} onLogout={handleLogout} /> : null}
      {status === 'success' && summary ? <DashboardSummary summary={summary} /> : null}
      {status === 'error' ? <p>Please try connecting again.</p> : null}
    </main>
  );
}
