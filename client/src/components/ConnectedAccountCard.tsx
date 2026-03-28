import React from 'react';

export type ConnectedUser = {
  id: string;
  spotifyUserId: string;
  displayName: string | null;
};

type Props = {
  user: ConnectedUser;
  onLogout?: () => void;
};

export default function ConnectedAccountCard({ user, onLogout }: Props) {
  return (
    <div>
      <h3>Spotify Connected</h3>
      <p>Connected as: {user.displayName ?? user.spotifyUserId}</p>
      {onLogout ? (
        <button type="button" onClick={onLogout}>
          Disconnect
        </button>
      ) : null}
    </div>
  );
}

// by Jeremy Southern
