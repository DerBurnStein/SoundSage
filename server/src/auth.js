import { OAuth2Client } from 'google-auth-library';
import { repository } from './repository.js';

const clientId = process.env.GOOGLE_CLIENT_ID;
const oauthClient = clientId ? new OAuth2Client(clientId) : null;

function getBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export async function requireAppAuth(req, res, next) {
  if (process.env.TEST_BYPASS_AUTH === "1") {
    const user = await repository.findOrCreateUserByGoogleSub("test-subject", { displayName: "Test User" });
    req.userId = user.id;
    req.googleSub = user.googleSub;
    return next();
  }
  if (!oauthClient) {
    return res.status(500).json({ error: 'Server auth misconfigured: GOOGLE_CLIENT_ID missing' });
  }

  const idToken = getBearer(req);
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  try {
    const ticket = await oauthClient.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub) return res.status(401).json({ error: 'Unauthorized: invalid token subject' });

    const user = await repository.findOrCreateUserByGoogleSub(payload.sub, {
      displayName: payload.name || payload.email || 'SoundSage User',
    });

    req.userId = user.id;
    req.googleSub = payload.sub;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized: token verification failed or expired' });
  }
}
