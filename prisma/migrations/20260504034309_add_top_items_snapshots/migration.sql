-- CreateTable
CREATE TABLE "top_track_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "trackId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "top_track_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_artist_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "artistId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "top_artist_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "top_track_snapshots_userId_range_idx" ON "top_track_snapshots"("userId", "range");

-- CreateIndex
CREATE UNIQUE INDEX "top_track_snapshots_userId_range_rank_key" ON "top_track_snapshots"("userId", "range", "rank");

-- CreateIndex
CREATE INDEX "top_artist_snapshots_userId_range_idx" ON "top_artist_snapshots"("userId", "range");

-- CreateIndex
CREATE UNIQUE INDEX "top_artist_snapshots_userId_range_rank_key" ON "top_artist_snapshots"("userId", "range", "rank");

-- AddForeignKey
ALTER TABLE "top_track_snapshots" ADD CONSTRAINT "top_track_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_track_snapshots" ADD CONSTRAINT "top_track_snapshots_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_artist_snapshots" ADD CONSTRAINT "top_artist_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_artist_snapshots" ADD CONSTRAINT "top_artist_snapshots_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
