import crypto from 'crypto';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const REQUIRED_SCOPES = [
  'user-read-recently-played',
  'user-read-email',
  'user-read-private',
];

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function randomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function buildPkcePair() {
  const verifier = randomString(48);
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: REQUIRED_SCOPES.join(' '),
    show_dialog: 'true',
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, verifier, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const r = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await r.json();
  if (!r.ok) throw new Error(`Spotify token exchange failed: ${r.status} ${JSON.stringify(data)}`);
  return data;
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const r = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Spotify refresh failed: ${r.status} ${JSON.stringify(data)}`);
  return data;
}

export function validateScopes(scopeStr = '') {
  const got = new Set(scopeStr.split(/\s+/).filter(Boolean));
  const missing = REQUIRED_SCOPES.filter((s) => !got.has(s));
  return { valid: missing.length === 0, missing, got: [...got] };
}

export { REQUIRED_SCOPES };
