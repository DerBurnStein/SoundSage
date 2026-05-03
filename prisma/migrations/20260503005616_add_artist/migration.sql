-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "albumId" TEXT,
ADD COLUMN     "artistIds" TEXT[];

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "genres" TEXT[],
    "genresSynced" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artists_genresSynced_idx" ON "artists"("genresSynced");
