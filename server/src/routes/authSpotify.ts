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
      spotifyUserId: string;
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
  const scopes = process.env.SPOTIFY_SCOPES ?? 'user-read-recently-played user-top-read';

  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();

  const requestedReturnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '';
  let safeReturnTo: string | undefined;
  if (requestedReturnTo) {
    try {
      const parsed = new URL(requestedReturnTo);
      if (parsed.origin === FRONTEND_ALLOWED_RETURN_ORIGIN) {
        safeReturnTo = parsed.toString();
      }
    } catch {
      safeReturnTo = undefined;
    }
  }

  req.session.spotifyAuth = {
    state,
    codeVerifier,
    createdAt: Date.now(),
    returnTo: safeReturnTo
  };

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

  if (!code || !state || !req.session.spotifyAuth) {
    return res.redirect(`${frontendCallbackUrl}?status=error&message=${encodeURIComponent('Missing code or state')}`);
  }

  if (req.session.spotifyAuth.state !== String(state)) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: 'Invalid state' }));
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

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: 'Token exchange failed' }));
  }

  const profileResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResponse.json();

  if (!profileResponse.ok) {
    return res.redirect(buildFrontendRedirect({ status: 'error', message: 'Profile fetch failed' }));
  }

  const userId = crypto.randomUUID();
  const spotifyUserId = String(profileData.id);
  const displayName = profileData.display_name ? String(profileData.display_name) : null;
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in ?? 3600) * 1000);

  await upsertSpotifyUserTokens({
    userId,
    spotifyUserId,
    displayName,
    accessToken: encryptToken(String(tokenData.access_token)),
    refreshToken: encryptToken(String(tokenData.refresh_token ?? '')),
    scope: tokenData.scope ? String(tokenData.scope) : null,
    expiresAt
  });

  req.session.authUser = { id: userId, spotifyUserId, displayName };
  req.session.spotifyAuth = undefined;

  return res.redirect(buildFrontendRedirect({ status: 'success', provider: 'spotify' }));
});

router.get('/me', async (req: Request, res: Response) => {
  if (!req.session.authUser) {
    return res.status(401).json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: req.session.authUser
  });
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

// by Jeremy Southern
