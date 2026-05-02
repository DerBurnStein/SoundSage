-- CreateTable
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "googleSub" TEXT NOT NULL UNIQUE,
  "displayName" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SpotifyAccount" (
  "userId" TEXT PRIMARY KEY,
  "spotifyUserId" TEXT NOT NULL UNIQUE,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "cursor" TIMESTAMP,
  "lastSyncAt" TIMESTAMP,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "connected" BOOLEAN NOT NULL DEFAULT FALSE,
  "scopeValid" BOOLEAN NOT NULL DEFAULT FALSE,
  "scopeMissing" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "SpotifyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "ListeningEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "spotifyTrackId" TEXT NOT NULL,
  "trackName" TEXT NOT NULL,
  "artistNames" JSONB NOT NULL,
  "playedAt" TIMESTAMP NOT NULL,
  "msPlayed" INTEGER,
  "genre" TEXT,
  CONSTRAINT "ListeningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "IngestionState" (
  "userId" TEXT PRIMARY KEY,
  "highWatermarkPlayedAt" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "lastRunStartedAt" TIMESTAMP,
  "lastRunFinishedAt" TIMESTAMP,
  "lastError" TEXT,
  CONSTRAINT "IngestionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "OAuthState" (
  "userId" TEXT PRIMARY KEY,
  "stateHash" TEXT NOT NULL,
  "verifier" TEXT NOT NULL,
  "csrfNonce" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ListeningEvent_user_track_played_unique" ON "ListeningEvent" ("userId", "spotifyTrackId", "playedAt");
CREATE INDEX "ListeningEvent_user_played_desc_idx" ON "ListeningEvent" ("userId", "playedAt" DESC);
CREATE INDEX "ListeningEvent_user_track_idx" ON "ListeningEvent" ("userId", "spotifyTrackId");
CREATE INDEX "ListeningEvent_user_genre_idx" ON "ListeningEvent" ("userId", "genre");
CREATE INDEX "SpotifyAccount_lastSyncAt_idx" ON "SpotifyAccount" ("lastSyncAt");

CREATE TABLE "IngestionMetric" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "insertedCount" INTEGER NOT NULL,
  "receivedCount" INTEGER NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngestionMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "IngestionMetric_user_created_idx" ON "IngestionMetric" ("userId", "createdAt" DESC);
CREATE INDEX "IngestionMetric_status_created_idx" ON "IngestionMetric" ("status", "createdAt" DESC);
