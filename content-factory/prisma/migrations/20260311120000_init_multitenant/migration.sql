-- CreateTable
CREATE TABLE "admin_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "master_prompt_1" TEXT NOT NULL,
    "master_prompt_2" TEXT NOT NULL,
    "master_prompt_3" TEXT NOT NULL,
    "master_prompt_image" TEXT NOT NULL,
    "master_prompt_image_ref" TEXT NOT NULL,
    "master_prompt_grounding" TEXT NOT NULL,
    "headline_rules" TEXT NOT NULL,
    "defaultTextModel" TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat',
    "defaultImageModel" TEXT NOT NULL DEFAULT 'google/gemini-3.1-flash-image-preview',
    "defaultGroundingModel" TEXT NOT NULL DEFAULT 'perplexity/sonar',
    "updatedAt" TIMESTAMP(3) NOT NULL

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "telegram_chat_id" TEXT,
    "openrouter_api_key" TEXT NOT NULL,
    "spreadsheet_id" TEXT,
    "telegram_channel_id" TEXT,
    "notify_chat_id" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_settings" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trustedSites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product_details" TEXT,
    "dna_brand" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "image_style" TEXT NOT NULL,
    "logo_url" TEXT,
    "utm_template" TEXT,
    "frequency_limit" TEXT DEFAULT '300',
    "maxArticlesPerDay" INTEGER NOT NULL DEFAULT 10,
    "moderationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publishIntervalMin" INTEGER NOT NULL DEFAULT 60,
    "publishWindowStart" TEXT DEFAULT '',
    "publishWindowEnd" TEXT DEFAULT '',
    "dailySummaryTime" TEXT NOT NULL DEFAULT '21:00',
    "generationTime" TEXT NOT NULL DEFAULT '05:00',
    "imageGenMode" TEXT NOT NULL DEFAULT 'immediate',
    "headlinesCount" INTEGER NOT NULL DEFAULT 30,
    "textModel" TEXT,
    "imageModel" TEXT,
    "groundingModel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_steps" (
    "id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "file_type" TEXT NOT NULL DEFAULT 'video_note',

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "sheet_row" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "headline" TEXT,
    "keywords" TEXT,
    "status" TEXT NOT NULL,
    "full_text" TEXT,
    "sources" TEXT,
    "image_url" TEXT,
    "utm_url" TEXT,
    "post_url" TEXT,
    "costText" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costImage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_records" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "task_id" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "action" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_telegram_chat_id_key" ON "clients"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_settings_client_id_key" ON "client_settings"("client_id");

-- CreateIndex
CREATE INDEX "tasks_client_id_status_idx" ON "tasks"("client_id", "status");

-- CreateIndex
CREATE INDEX "cost_records_client_id_createdAt_idx" ON "cost_records"("client_id", "createdAt");

-- CreateIndex
CREATE INDEX "logs_client_id_createdAt_idx" ON "logs"("client_id", "createdAt");

-- AddForeignKey
ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_records" ADD CONSTRAINT "cost_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
