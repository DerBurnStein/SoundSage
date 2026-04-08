import { Router } from 'express';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { upsertGoogleIdentityUser } from '../utils/db';

const router = Router();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

router.post('/login', async (req: Request, res: Response) => {
  const idToken = req.body?.credential;
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'Missing Google credential token' });
  }

  const clientId = requiredEnv('GOOGLE_CLIENT_ID');
  const oauthClient = new OAuth2Client(clientId);

  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: clientId
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    return res.status(400).json({ error: 'Invalid Google token payload' });
  }

  const user = await upsertGoogleIdentityUser({
    googleSubject: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    displayName: payload.name ?? null
  });

  req.session.authUser = {
    id: user.id,
    spotifyUserId: user.spotifyUserId,
    displayName: user.displayName
  };

  return res.json({ authenticated: true, user: req.session.authUser });
});

export default router;
