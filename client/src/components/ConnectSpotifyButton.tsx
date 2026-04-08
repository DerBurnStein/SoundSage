import React from 'react';

type Props = {
  className?: string;
};

const apiBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';

export default function ConnectSpotifyButton({ className = '' }: Props) {
  const handleClick = () => {
    window.location.href = `${apiBase}/auth/spotify/login`;
  };

  return (
    <button className={className} onClick={handleClick} type="button">
      Connect Spotify to Build Insights
    </button>
  );
}
