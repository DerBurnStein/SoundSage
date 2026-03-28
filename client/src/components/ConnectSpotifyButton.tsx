import React from 'react';

type Props = {
  className?: string;
};

export default function ConnectSpotifyButton({ className = '' }: Props) {
  const handleClick = () => {
    window.location.href = 'http://127.0.0.1:3000/auth/spotify/login';
  };

  return (
    <button className={className} onClick={handleClick} type="button">
      Connect Spotify
    </button>
  );
}

// by Jeremy Southern
