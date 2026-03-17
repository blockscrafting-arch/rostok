-- AlterTable
ALTER TABLE "client_settings" ADD COLUMN "tonality" TEXT NOT NULL DEFAULT '',
ADD COLUMN "target_audience" TEXT NOT NULL DEFAULT '',
ADD COLUMN "negative_prompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "operation_mode" TEXT NOT NULL DEFAULT 'safe';
