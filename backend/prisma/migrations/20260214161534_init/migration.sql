-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "StatusEntreprise" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Metier" AS ENUM ('DEMENAGEMENT');

-- CreateEnum
CREATE TYPE "PrioriteLead" AS ENUM ('CHAUD', 'TIEDE', 'MOYEN', 'FROID');

-- CreateEnum
CREATE TYPE "StatutLead" AS ENUM ('NOUVEAU', 'CONTACTE', 'CONVERTI', 'PERDU');

-- CreateEnum
CREATE TYPE "StatusConversation" AS ENUM ('ACTIVE', 'QUALIFIED', 'ABANDONED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RoleMessage" AS ENUM ('user', 'assistant', 'system');

-- CreateTable
CREATE TABLE "Entreprise" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" "StatusEntreprise" NOT NULL DEFAULT 'TRIAL',
    "apiKey" TEXT NOT NULL,
    "nomBot" TEXT NOT NULL DEFAULT 'Assistant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigMetier" (
    "id" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,
    "metier" "Metier" NOT NULL,
    "zonesIntervention" TEXT[],
    "tarifsCustom" JSONB NOT NULL,
    "specificites" JSONB NOT NULL,
    "promptCustom" TEXT,
    "documentsCalcul" JSONB,
    "consignesPersonnalisees" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigMetier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,
    "prenom" TEXT,
    "nom" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "projetData" JSONB NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "priorite" "PrioriteLead" NOT NULL DEFAULT 'MOYEN',
    "statut" "StatutLead" NOT NULL DEFAULT 'NOUVEAU',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "entrepriseId" TEXT NOT NULL,
    "metier" "Metier" NOT NULL,
    "status" "StatusConversation" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "RoleMessage" NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCache" (
    "id" TEXT NOT NULL,
    "metier" "Metier" NOT NULL,
    "questionEmbedding" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entreprise_email_key" ON "Entreprise"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Entreprise_apiKey_key" ON "Entreprise"("apiKey");

-- CreateIndex
CREATE INDEX "Entreprise_apiKey_idx" ON "Entreprise"("apiKey");

-- CreateIndex
CREATE INDEX "Entreprise_email_idx" ON "Entreprise"("email");

-- CreateIndex
CREATE INDEX "ConfigMetier_entrepriseId_idx" ON "ConfigMetier"("entrepriseId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigMetier_entrepriseId_metier_key" ON "ConfigMetier"("entrepriseId", "metier");

-- CreateIndex
CREATE INDEX "Lead_entrepriseId_idx" ON "Lead"("entrepriseId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_statut_idx" ON "Lead"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_leadId_key" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_entrepriseId_idx" ON "Conversation"("entrepriseId");

-- CreateIndex
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationCache_metier_idx" ON "ConversationCache"("metier");

-- AddForeignKey
ALTER TABLE "ConfigMetier" ADD CONSTRAINT "ConfigMetier_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
