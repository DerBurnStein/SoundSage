import React from 'react';

export type ConnectedUser = {
  id: string;
  spotifyUserId: string | null;
  displayName: string | null;
};

type Props = {
  user: ConnectedUser;
  onLogout?: () => void;
};

export default function ConnectedAccountCard({ user, onLogout }: Props) {
  return (
    <section>
      <h3>Spotify Connected</h3>
      <p>
        Signed in as <strong>{user.displayName ?? user.spotifyUserId ?? 'SoundSage user'}</strong>
      </p>
      {onLogout ? (
        <button type="button" onClick={onLogout}>
          Disconnect Spotify
        </button>
      ) : null}
    </section>
  );
}
