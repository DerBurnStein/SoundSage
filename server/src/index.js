import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { requireAppAuth } from './auth.js';
import { buildPkcePair, buildAuthorizeUrl, exchangeCodeForTokens, refreshAccessToken, validateScopes } from './spotifyAuth.js';
import { getRangeFromParam, overview, hourly, activity, genres, weekly, topTracks, topArtists } from './analytics.js';
import { repository } from './repository.js';
import { enqueueIngestion } from './queue.js';
import { ApiError, toErrorResponse } from './errors.js';
import { parseOrThrow, queryRangeSchema, queryPaginationSchema, syncIngestSchema } from './validation.js';
import { requestContext } from './logging.js';
import { getOpsDashboardSnapshot, evaluateSLOs, reportError, logEvent } from './monitoring.js';
import { sendAlert } from './alerts.js';
import { prisma } from './prisma.js';

dotenv.config();

export function createApp() {
const app = express();
const corsAllowlist = (process.env.CORS_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (corsAllowlist.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.SESSION_COOKIE_SECRET || 'change-me'));

app.set('trust proxy', 1);
const generalLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use(generalLimiter);
app.use(requestContext);
app.use('/api', requireAppAuth);

function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

app.get('/api/me', asyncRoute(async (req, res) => {
  const user = await repository.getUserById(req.userId);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  res.json({ user });
}));

app.get('/api/spotify/connection', asyncRoute(async (req, res) => {
  const account = await repository.getAccount(req.userId);
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Spotify account not found');
  res.json({ connected: account.connected, account });
}));

app.post('/api/spotify/connect/start', authLimiter, asyncRoute(async (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new ApiError(500, 'SPOTIFY_MISCONFIG', 'Spotify OAuth misconfigured');

  const { verifier, challenge } = buildPkcePair();
  const state = crypto.randomBytes(16).toString('hex');
  const csrfNonce = crypto.randomBytes(16).toString('hex');
  await repository.saveSpotifyOauthState(req.userId, state, verifier, csrfNonce);
  res.cookie('ss_oauth_nonce', csrfNonce, { httpOnly: true, sameSite: 'lax', secure: true, signed: true, maxAge: 10 * 60 * 1000 });
  res.json({ authorizeUrl: buildAuthorizeUrl({ clientId, redirectUri, state, challenge }) });
}));

app.get('/api/spotify/connect/callback', asyncRoute(async (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new ApiError(500, 'SPOTIFY_MISCONFIG', 'Spotify OAuth misconfigured');

  const code = req.query.code ? String(req.query.code) : null;
  const state = req.query.state ? String(req.query.state) : null;
  if (!code || !state) throw new ApiError(400, 'MISSING_CODE_OR_STATE', 'Missing code/state');

  const csrfNonce = req.signedCookies?.ss_oauth_nonce;
  if (!csrfNonce) throw new ApiError(400, 'MISSING_OAUTH_NONCE', 'Missing OAuth nonce cookie');
  const oauthState = await repository.consumeSpotifyOauthState(req.userId, state, csrfNonce);
  if (!oauthState) throw new ApiError(400, 'INVALID_OAUTH_STATE', 'Invalid or expired OAuth state');

  res.clearCookie('ss_oauth_nonce');
  const tokenData = await exchangeCodeForTokens({ code, verifier: oauthState.verifier, redirectUri, clientId, clientSecret });
  const scopeValidation = validateScopes(tokenData.scope);
  const account = await repository.saveSpotifyTokens(req.userId, tokenData, scopeValidation);
  res.json({ connected: true, scopeValid: account.scopeValid, missingScopes: account.scopeMissing });
}));

app.post('/api/spotify/token/refresh', asyncRoute(async (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ApiError(500, 'SPOTIFY_MISCONFIG', 'Spotify OAuth misconfigured');

  const tokens = await repository.getSpotifyTokens(req.userId);
  if (!tokens?.refreshToken) throw new ApiError(400, 'NO_REFRESH_TOKEN', 'No refresh token available');
  const refreshed = await refreshAccessToken({ refreshToken: tokens.refreshToken, clientId, clientSecret });
  const account = await repository.getAccount(req.userId);
  const scopeValidation = validateScopes(refreshed.scope || account?.grantedScopes?.join(' '));
  await repository.saveSpotifyTokens(req.userId, { ...refreshed, refresh_token: refreshed.refresh_token || tokens.refreshToken }, scopeValidation);
  res.json({ ok: true, tokenState: 'fresh' });
}));

app.post('/api/spotify/reconnect', asyncRoute(async (req, res) => { await repository.clearSpotifyConnection(req.userId); res.json({ ok: true }); }));

app.get('/api/sync/status', asyncRoute(async (req, res) => {
  const account = await repository.getAccount(req.userId);
  if (!account) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Spotify account not found');
  const today = new Date().toISOString().slice(0, 10);
  const events = await repository.listEvents(req.userId);
  const eventsToday = events.filter((e) => new Date(e.playedAt).toISOString().startsWith(today)).length;
  res.json({ lastSyncAt: account.lastSyncAt, cursor: account.cursor, lag: 'fresh', failureCount: account.failureCount ?? 0, tokens: account.tokenState ?? 'expired', eventCount: events.length, eventsToday });
}));

app.post('/api/sync/trigger', asyncRoute(async (req, res) => { const job = await enqueueIngestion(req.userId, 'manual'); res.json({ jobId: job.id }); }));
app.post('/api/sync/ingest', asyncRoute(async (req, res) => { const body = parseOrThrow(syncIngestSchema, req.body, 'body'); const result = await repository.ingestEvents(req.userId, body.events); await repository.updateSync(req.userId, new Date().toISOString()); res.json(result); }));

app.get('/api/stats/overview', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema, req.query, 'query'); res.json(overview(await repository.listEvents(req.userId), getRangeFromParam(q.range || '4w'))); }));
app.get('/api/stats/activity', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema, req.query, 'query'); const grain = ['day','week','month'].includes(String(req.query.grain || 'day')) ? String(req.query.grain || 'day') : 'day'; res.json(activity(await repository.listEvents(req.userId), getRangeFromParam(q.range || '4w'), grain)); }));
app.get('/api/stats/hourly', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema, req.query, 'query'); res.json(hourly(await repository.listEvents(req.userId), getRangeFromParam(q.range || '4w'))); }));
app.get('/api/stats/genres', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema.extend({ limit: queryPaginationSchema.shape.limit }), req.query, 'query'); res.json(genres(await repository.listEvents(req.userId), getRangeFromParam(q.range || '4w'), q.limit || 8)); }));
app.get('/api/stats/weekly', asyncRoute(async (req, res) => res.json(weekly(await repository.listEvents(req.userId)))));
app.get('/api/tracks/top', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema.extend({ limit: queryPaginationSchema.shape.limit }), req.query, 'query'); const range = q.range || '4w'; res.json({ ...topTracks(await repository.listEvents(req.userId), getRangeFromParam(range), q.limit || 20), range }); }));
app.get('/api/artists/top', asyncRoute(async (req, res) => { const q = parseOrThrow(queryRangeSchema.extend({ limit: queryPaginationSchema.shape.limit }), req.query, 'query'); const range = q.range || '4w'; res.json({ ...topArtists(await repository.listEvents(req.userId), getRangeFromParam(range), q.limit || 20), range }); }));
app.get('/api/history/recent', asyncRoute(async (req, res) => {
  const q = parseOrThrow(queryPaginationSchema, req.query, 'query');
  const limit = q.limit || 25;
  const events = await repository.listEvents(req.userId);
  const filtered = q.cursor ? events.filter((e) => new Date(e.playedAt) < new Date(q.cursor)) : events;
  const page = filtered.slice(0, limit);
  const nextCursor = filtered.length > limit ? new Date(page[page.length - 1].playedAt).toISOString() : null;
  res.json({ events: page.map((e) => ({ id: String(e.id), playedAt: e.playedAt, track: { id: e.spotifyTrackId, name: e.trackName, artists: e.artistNames.map((name, i) => ({ id: `${name}_${i}`, name })), album: { id: 'album_demo', name: 'Demo Album', imageUrl: null }, durationMs: e.msPlayed } })), nextCursor });
}));


app.get('/ops/dashboard', asyncRoute(async (_req, res) => {
  const snapshot = await getOpsDashboardSnapshot();
  res.json({ snapshot, slos: evaluateSLOs(snapshot) });
}));

app.get('/health/live', (_req, res) => res.status(200).json({ ok: true, kind: 'liveness' }));
app.get('/health/ready', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.status(200).json({ ok: true, kind: 'readiness' });
}));
app.get('/healthz', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, kind: 'healthz' });
}));


app.use((err, req, res, _next) => {
  const out = toErrorResponse(err, req.correlationId);
  console.error(JSON.stringify({ level: 'error', correlationId: req.correlationId, code: out.body.error.code, message: out.body.error.message }));
  reportError(err, { correlationId: req.correlationId, code: out.body.error.code });
  if (['SPOTIFY_MISCONFIG','NO_REFRESH_TOKEN'].includes(out.body.error.code)) sendAlert('token_refresh_failure', out.body.error);
  res.status(out.status).json(out.body);
});

return app;
}

export function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 8080);
  return app.listen(port, () => console.log(`SoundSage API listening on :${port}`));
}

if (process.argv[1]?.includes('index.js')) {
  startServer();
}
