-- CreateEnum
CREATE TYPE "CaptionStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CaptionJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "caption_segments_text_trgm_idx";

-- DropIndex
DROP INDEX "media_items_description_trgm_idx";

-- DropIndex
DROP INDEX "media_items_title_trgm_idx";

-- AlterTable
ALTER TABLE "media_items" ADD COLUMN     "captionErrorMessage" TEXT,
ADD COLUMN     "captionGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "captionStatus" "CaptionStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "caption_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaItemId" TEXT NOT NULL,
    "status" "CaptionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedStartTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caption_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caption_jobs_status_priority_createdAt_idx" ON "caption_jobs"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "caption_jobs_userId_status_idx" ON "caption_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "media_items_captionStatus_createdAt_idx" ON "media_items"("captionStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "caption_jobs" ADD CONSTRAINT "caption_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_jobs" ADD CONSTRAINT "caption_jobs_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
