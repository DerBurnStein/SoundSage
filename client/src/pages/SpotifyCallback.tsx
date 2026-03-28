import React, { useEffect, useMemo, useState } from 'react';
import ConnectedAccountCard, { type ConnectedUser } from '../components/ConnectedAccountCard';

type AuthMeResponse = {
  authenticated: boolean;
  user?: ConnectedUser;
};

export default function SpotifyCallbackPage() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Finishing Spotify login...');
  const [user, setUser] = useState<ConnectedUser | null>(null);

  useEffect(() => {
    const queryStatus = search.get('status');
    const queryMessage = search.get('message');

    if (queryStatus === 'error') {
      setStatus('error');
      setMessage(queryMessage ?? 'Spotify login failed');
      return;
    }

    fetch('http://127.0.0.1:3000/auth/spotify/me', {
      credentials: 'include'
    })
      .then((response) => response.json() as Promise<AuthMeResponse>)
      .then((data) => {
        if (!data.authenticated || !data.user) {
          setStatus('error');
          setMessage('Spotify login did not complete successfully.');
          return;
        }
        setUser(data.user);
        setStatus('success');
        setMessage(`Connected as ${data.user.displayName ?? data.user.spotifyUserId}`);
      })
      .catch(() => {
        setStatus('error');
        setMessage('Could not verify Spotify session.');
      });
  }, [search]);

  const handleLogout = async () => {
    await fetch('http://127.0.0.1:3000/auth/spotify/logout', {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
    setStatus('success');
    setMessage('Disconnected from Spotify');
  };

  return (
    <main>
      <h2>Spotify Callback</h2>
      <p>{message}</p>
      {status === 'loading' ? <p>Loading...</p> : null}
      {status === 'success' && user ? <ConnectedAccountCard user={user} onLogout={handleLogout} /> : null}
      {status === 'error' ? <p>Please try connecting again.</p> : null}
    </main>
  );
}

// by Jeremy Southern
