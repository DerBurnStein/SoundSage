import React, { useEffect, useRef } from 'react';

type Props = {
  onAuthenticated?: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

const apiBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';
const googleClientId = (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '';

export default function GoogleSignInButton({ onAuthenticated }: Props) {
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!window.google || !buttonRef.current || !googleClientId) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!response.credential) {
          return;
        }

        await fetch(`${apiBase}/auth/google/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ credential: response.credential })
        });

        if (onAuthenticated) {
          onAuthenticated();
        }
      }
    });

    buttonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signup_with'
    });
  }, [onAuthenticated]);

  return <div ref={buttonRef} />;
}
