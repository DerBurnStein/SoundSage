import crypto from 'crypto';
import { prisma } from './prisma.js';
import { encryptToken, decryptToken } from './tokenCrypto.js';

export const repository = {
  async findOrCreateUserByGoogleSub(googleSub, profile = {}) {
    return prisma.user.upsert({
      where: { googleSub },
      update: { displayName: profile.displayName || undefined },
      create: {
        googleSub,
        displayName: profile.displayName || null,
        account: {
          create: {
            spotifyUserId: `spotify_${googleSub}`,
            accessToken: '',
            refreshToken: '',
            expiresAt: new Date(0),
            connected: false,
          },
        },
        ingestion: { create: { status: 'idle' } },
      },
      include: { account: true, ingestion: true },
    });
  },

  async getUserById(userId) {
    return prisma.user.findUnique({ where: { id: userId } });
  },

  async getAccount(userId) {
    return prisma.spotifyAccount.findUnique({ where: { userId } });
  },

  async saveSpotifyOauthState(userId, state, verifier, csrfNonce) {
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    await prisma.oAuthState.upsert({
      where: { userId },
      update: { stateHash, verifier, csrfNonce, createdAt: new Date() },
      create: { userId, stateHash, verifier, csrfNonce },
    });
  },

  async consumeSpotifyOauthState(userId, state, csrfNonce) {
    const row = await prisma.oAuthState.findUnique({ where: { userId } });
    if (!row) return null;
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const expired = Date.now() - new Date(row.createdAt).getTime() > 10 * 60 * 1000;
    const valid = row.stateHash === stateHash && row.csrfNonce === csrfNonce && !expired;
    await prisma.oAuthState.delete({ where: { userId } });
    return valid ? row : null;
  },

  async saveSpotifyTokens(userId, tokenPayload, scopeValidation) {
    return prisma.spotifyAccount.update({
      where: { userId },
      data: {
        accessToken: await encryptToken(tokenPayload.access_token),
        refreshToken: tokenPayload.refresh_token ? await encryptToken(tokenPayload.refresh_token) : undefined,
        expiresAt: new Date(Date.now() + tokenPayload.expires_in * 1000),
        connected: true,
        scopeValid: scopeValidation.valid,
        scopeMissing: scopeValidation.missing,
        grantedScopes: scopeValidation.got,
      },
    });
  },

  async getSpotifyTokens(userId) {
    const account = await prisma.spotifyAccount.findUnique({ where: { userId } });
    if (!account?.accessToken) return null;
    return { accessToken: await decryptToken(account.accessToken), refreshToken: account.refreshToken ? await decryptToken(account.refreshToken) : null, expiresAt: account.expiresAt.toISOString() };
  },

  async clearSpotifyConnection(userId) {
    await prisma.spotifyAccount.update({
      where: { userId },
      data: { connected: false, accessToken: '', refreshToken: '', scopeValid: false, scopeMissing: [], grantedScopes: [] },
    });
  },

  async listEvents(userId) {
    return prisma.listeningEvent.findMany({ where: { userId }, orderBy: { playedAt: 'desc' } });
  },

  async ingestEvents(userId, incomingEvents) {
    let inserted = 0;
    for (const event of incomingEvents) {
      try {
        await prisma.listeningEvent.create({
          data: {
            userId,
            spotifyTrackId: event.spotifyTrackId,
            trackName: event.trackName,
            artistNames: event.artistNames,
            playedAt: new Date(event.playedAt),
            msPlayed: event.msPlayed,
            genre: event.genre,
          },
        });
        inserted += 1;
      } catch (err) {
        if (!String(err).includes('Unique constraint')) throw err;
      }
    }
    return { inserted, received: incomingEvents.length };
  },


  async getIngestionState(userId) {
    return prisma.ingestionState.findUnique({ where: { userId } });
  },

  async markIngestionRunStarted(userId, startedAt) {
    await prisma.ingestionState.upsert({
      where: { userId },
      update: { status: 'running', lastRunStartedAt: new Date(startedAt), lastError: null },
      create: { userId, status: 'running', lastRunStartedAt: new Date(startedAt) },
    });
  },

  async markIngestionRunFinished(userId, { finishedAt, highWatermarkPlayedAt, status, lastError, latencyMs, insertedCount, receivedCount }) {
    await prisma.ingestionState.upsert({
      where: { userId },
      update: {
        status,
        lastRunFinishedAt: new Date(finishedAt),
        highWatermarkPlayedAt: highWatermarkPlayedAt ? new Date(highWatermarkPlayedAt) : null,
        lastError,
      },
      create: {
        userId,
        status,
        lastRunFinishedAt: new Date(finishedAt),
        highWatermarkPlayedAt: highWatermarkPlayedAt ? new Date(highWatermarkPlayedAt) : null,
        lastError,
      },
    });

    await prisma.ingestionMetric.create({
      data: { userId, latencyMs, insertedCount, receivedCount, status: 'success' },
    });
  },

  async markIngestionRunFailed(userId, { failedAt, error, latencyMs }) {
    await prisma.ingestionState.upsert({
      where: { userId },
      update: { status: 'error', lastRunFinishedAt: new Date(failedAt), lastError: error },
      create: { userId, status: 'error', lastRunFinishedAt: new Date(failedAt), lastError: error },
    });

    await prisma.spotifyAccount.updateMany({ where: { userId }, data: { failureCount: { increment: 1 } } });
    await prisma.ingestionMetric.create({
      data: { userId, latencyMs, insertedCount: 0, receivedCount: 0, status: 'failed', error },
    });
  },

  async updateSync(userId, iso) {
    await prisma.spotifyAccount.update({ where: { userId }, data: { lastSyncAt: new Date(iso), cursor: new Date(iso) } });
    await prisma.ingestionState.upsert({
      where: { userId },
      update: { highWatermarkPlayedAt: new Date(iso), status: 'idle', lastRunFinishedAt: new Date(iso) },
      create: { userId, highWatermarkPlayedAt: new Date(iso), status: 'idle', lastRunFinishedAt: new Date(iso) },
    });
  },
};
