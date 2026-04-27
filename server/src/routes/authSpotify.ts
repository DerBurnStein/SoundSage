import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { generatePkcePair, generateState } from '../utils/pkce';
import { encryptToken } from '../utils/tokenCrypto';
import { upsertSpotifyUserTokens } from '../utils/db';

declare module 'express-session' {
  interface SessionData {
    spotifyAuth?: {
      state: string;
      codeVerifier: string;
      createdAt: number;
      returnTo?: string;
    };
    authUser?: {
      id: string;
      spotifyUserId: string | null;
      displayName: string | null;
    };
  }
}

const router = Router();
const FRONTEND_ALLOWED_RETURN_ORIGIN = process.env.SPOTIFY_FRONTEND_ALLOWED_ORIGIN ?? 'http://127.0.0.1:5500';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

router.get('/login', (req: Request, res: Response) => {
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');
  const redirectUri = requiredEnv('SPOTIFY_REDIRECT_URI');
  const scopes = process.env.SPOTIFY_SCOPES ?? 'user-read-recently-played user-top-read user-read-email';

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();

  req.session.spotifyAuth = { state, codeVerifier, createdAt: Date.now() };

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    scope: scopes
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const redirectUri = requiredEnv('SPOTIFY_REDIRECT_URI');
  const frontendCallbackUrl = requiredEnv('SPOTIFY_FRONTEND_CALLBACK_URL');
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');

  const buildFrontendRedirect = (params: Record<string, string>) => {
    const destination = req.session.spotifyAuth?.returnTo ?? frontendCallbackUrl;
    const redirectTarget = new URL(destination);
    Object.entries(params).forEach(([key, value]) => redirectTarget.searchParams.set(key, value));
    return redirectTarget.toString();
  };

  if (error) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: String(error) }));
  }

  if (!code || !state || !req.session.spotifyAuth || req.session.spotifyAuth.state !== String(state)) {
    return res.redirect(`${frontendCallbackUrl}?status=error&message=${encodeURIComponent('Missing or invalid state')}`);
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: req.session.spotifyAuth.codeVerifier
  });

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody
  });

  if (!tokenResponse.ok) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: 'Token exchange failed' }));
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };

  const profileResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  if (!profileResponse.ok) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: 'Profile fetch failed' }));
  }

  const profileData = await profileResponse.json() as {
    id: string;
    display_name?: string;
    email?: string;
    country?: string;
    product?: string;
  };

  const proposedUserId = crypto.randomUUID();
  const spotifyUserId = String(profileData.id);
  const displayName = profileData.display_name ? String(profileData.display_name) : null;
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in ?? 3600) * 1000);

  const userId = await upsertSpotifyUserTokens({
    userId: req.session.authUser?.id ?? proposedUserId,
    spotifyUserId,
    displayName,
    email: profileData.email ?? null,
    country: profileData.country ?? null,
    productTier: profileData.product ?? null,
    accessToken: encryptToken(tokenData.access_token),
    refreshToken: encryptToken(tokenData.refresh_token ?? ''),
    scope: tokenData.scope ? String(tokenData.scope) : null,
    expiresAt
  });

  req.session.authUser = { id: userId, spotifyUserId, displayName };
  req.session.spotifyAuth = undefined;

  return res.redirect(buildFrontendRedirect({ status: 'success', provider: 'spotify' }));
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.authUser) {
    return res.status(401).json({ authenticated: false });
  }

  return res.json({ authenticated: true, user: req.session.authUser });
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ ok: false });
    }

    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

export default router;
