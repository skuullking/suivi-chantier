-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OFFICE', 'WORKER');

-- CreateEnum
CREATE TYPE "Trade" AS ENUM ('CARPENTER', 'JOINER', 'POOL', 'RENOVATION', 'LANDSCAPER', 'OTHER');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('SOLO', 'TEAM', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "Slot" AS ENUM ('FULL_DAY', 'MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VOICE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('APP', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('MEDIA', 'MESSAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTE', 'INVOICE', 'PURCHASE_ORDER', 'EXPENSE', 'CONTRACT', 'PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD', 'EMAIL', 'WHATSAPP', 'GENERATED');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('NOTE', 'PROBLEM', 'VOICE');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "trade" "Trade" NOT NULL DEFAULT 'OTHER',
    "logoKey" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'TEAM',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "siteCounter" INTEGER NOT NULL DEFAULT 0,
    "photosAutoApprove" BOOLEAN NOT NULL DEFAULT false,
    "officeCanValidatePhotos" BOOLEAN NOT NULL DEFAULT true,
    "summaryAutoSend" BOOLEAN NOT NULL DEFAULT false,
    "summaryHour" INTEGER NOT NULL DEFAULT 18,
    "reminderHour" INTEGER NOT NULL DEFAULT 19,
    "retentionDocumentsYears" INTEGER NOT NULL DEFAULT 10,
    "retentionMediaYears" INTEGER NOT NULL DEFAULT 10,
    "retentionPurgeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "emails" TEXT[],
    "phones" TEXT[],
    "addresses" TEXT[],
    "notes" TEXT,
    "tags" TEXT[],
    "consentCommunications" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postalCode" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedStart" DATE,
    "plannedEnd" DATE,
    "actualStart" DATE,
    "actualEnd" DATE,
    "description" TEXT,
    "instructions" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" "Trade" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StepTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'TODO',
    "plannedStart" DATE,
    "plannedEnd" DATE,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "stepId" TEXT,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "Slot" NOT NULL DEFAULT 'FULL_DAY',
    "startTime" TEXT,
    "instructions" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "stepId" TEXT,
    "assigneeId" TEXT,
    "date" DATE,
    "title" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "stepId" TEXT,
    "authorId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "source" "MediaSource" NOT NULL DEFAULT 'APP',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "thumbnailKey" TEXT,
    "editedKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "caption" TEXT,
    "transcription" TEXT,
    "transcriptionStatus" "ProcessingStatus",
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "clientUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "InboxKind" NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'OPEN',
    "mediaId" TEXT,
    "documentId" TEXT,
    "messageText" TEXT,
    "fromPhone" TEXT,
    "fromEmail" TEXT,
    "authorId" TEXT,
    "proposedSiteId" TEXT,
    "proposedStepId" TEXT,
    "proposedClientId" TEXT,
    "proposedDocumentType" "DocumentType",
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "clientId" TEXT,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "documentDate" DATE,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "supplier" TEXT,
    "ocrText" TEXT,
    "tags" TEXT[],
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD',
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "classificationConfidence" DOUBLE PRECISION,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "generatedText" TEXT NOT NULL,
    "editedText" TEXT,
    "status" "SummaryStatus" NOT NULL DEFAULT 'DRAFT',
    "mediaIds" TEXT[],
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "NoteKind" NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "mediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalCustomerId" TEXT,
    "externalSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");

-- CreateIndex
CREATE INDEX "Client_organizationId_archivedAt_idx" ON "Client"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Client_searchVector_idx" ON "Client" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Site_organizationId_idx" ON "Site"("organizationId");

-- CreateIndex
CREATE INDEX "Site_organizationId_status_idx" ON "Site"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Site_clientId_idx" ON "Site"("clientId");

-- CreateIndex
CREATE INDEX "Site_plannedStart_idx" ON "Site"("plannedStart");

-- CreateIndex
CREATE INDEX "Site_searchVector_idx" ON "Site" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_code_key" ON "Site"("organizationId", "code");

-- CreateIndex
CREATE INDEX "StepTemplate_organizationId_idx" ON "StepTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "StepTemplateItem_templateId_idx" ON "StepTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "SiteStep_organizationId_idx" ON "SiteStep"("organizationId");

-- CreateIndex
CREATE INDEX "SiteStep_siteId_order_idx" ON "SiteStep"("siteId", "order");

-- CreateIndex
CREATE INDEX "SiteStep_status_idx" ON "SiteStep"("status");

-- CreateIndex
CREATE INDEX "Assignment_organizationId_date_idx" ON "Assignment"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Assignment_siteId_idx" ON "Assignment"("siteId");

-- CreateIndex
CREATE INDEX "Assignment_userId_date_idx" ON "Assignment"("userId", "date");

-- CreateIndex
CREATE INDEX "Task_organizationId_date_idx" ON "Task"("organizationId", "date");

-- CreateIndex
CREATE INDEX "Task_siteId_idx" ON "Task"("siteId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_date_idx" ON "Task"("assigneeId", "date");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Media_clientUploadId_key" ON "Media"("clientUploadId");

-- CreateIndex
CREATE INDEX "Media_organizationId_idx" ON "Media"("organizationId");

-- CreateIndex
CREATE INDEX "Media_siteId_receivedAt_idx" ON "Media"("siteId", "receivedAt");

-- CreateIndex
CREATE INDEX "Media_organizationId_validationStatus_idx" ON "Media"("organizationId", "validationStatus");

-- CreateIndex
CREATE INDEX "Media_authorId_idx" ON "Media"("authorId");

-- CreateIndex
CREATE INDEX "InboxItem_organizationId_status_idx" ON "InboxItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "Document_organizationId_type_idx" ON "Document"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Document_siteId_idx" ON "Document"("siteId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_documentDate_idx" ON "Document"("documentDate");

-- CreateIndex
CREATE INDEX "Document_searchVector_idx" ON "Document" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "DailySummary_organizationId_status_idx" ON "DailySummary"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_siteId_date_key" ON "DailySummary"("siteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalLink_tokenHash_key" ON "ClientPortalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPortalLink_organizationId_idx" ON "ClientPortalLink"("organizationId");

-- CreateIndex
CREATE INDEX "ClientPortalLink_siteId_idx" ON "ClientPortalLink"("siteId");

-- CreateIndex
CREATE INDEX "Note_siteId_createdAt_idx" ON "Note"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_organizationId_idx" ON "Note"("organizationId");

-- CreateIndex
CREATE INDEX "SiteEvent_siteId_createdAt_idx" ON "SiteEvent"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_organizationId_createdAt_idx" ON "SiteEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_phoneE164_key" ON "WhatsAppContact"("phoneE164");

-- CreateIndex
CREATE INDEX "WhatsAppContact_organizationId_idx" ON "WhatsAppContact"("organizationId");

-- CreateIndex
CREATE INDEX "MessageLog_channel_createdAt_idx" ON "MessageLog"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_toAddress_idx" ON "MessageLog"("toAddress");

-- CreateIndex
CREATE INDEX "MessageLog_fromAddress_idx" ON "MessageLog"("fromAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_provider_externalId_key" ON "MessageLog"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplateItem" ADD CONSTRAINT "StepTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStep" ADD CONSTRAINT "SiteStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteStep" ADD CONSTRAINT "SiteStep_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SiteStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SiteStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SiteStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_proposedSiteId_fkey" FOREIGN KEY ("proposedSiteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_proposedStepId_fkey" FOREIGN KEY ("proposedStepId") REFERENCES "SiteStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_proposedClientId_fkey" FOREIGN KEY ("proposedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalLink" ADD CONSTRAINT "ClientPortalLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalLink" ADD CONSTRAINT "ClientPortalLink_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEvent" ADD CONSTRAINT "SiteEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Full-text search (hand-written): accent-insensitive "simple" configuration so
-- that prefix search works while typing. Vectors are maintained by triggers.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION search_tsv(txt text, w "char") RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT setweight(to_tsvector('simple', immutable_unaccent(lower(coalesce(txt, '')))), w) $$;

CREATE OR REPLACE FUNCTION client_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" :=
    search_tsv(NEW."name", 'A') ||
    search_tsv(NEW."companyName", 'A') ||
    search_tsv(array_to_string(NEW."emails", ' ') || ' ' || array_to_string(NEW."phones", ' '), 'B') ||
    search_tsv(array_to_string(NEW."addresses", ' ') || ' ' || array_to_string(NEW."tags", ' '), 'B') ||
    search_tsv(NEW."notes", 'C');
  RETURN NEW;
END $$;

CREATE TRIGGER client_search_vector BEFORE INSERT OR UPDATE ON "Client"
  FOR EACH ROW EXECUTE FUNCTION client_search_vector_update();

CREATE OR REPLACE FUNCTION site_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" :=
    search_tsv(NEW."title", 'A') ||
    search_tsv(NEW."code", 'A') ||
    search_tsv(coalesce(NEW."address", '') || ' ' || coalesce(NEW."postalCode", '') || ' ' || coalesce(NEW."city", ''), 'B') ||
    search_tsv(NEW."description", 'C');
  RETURN NEW;
END $$;

CREATE TRIGGER site_search_vector BEFORE INSERT OR UPDATE ON "Site"
  FOR EACH ROW EXECUTE FUNCTION site_search_vector_update();

CREATE OR REPLACE FUNCTION document_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" :=
    search_tsv(NEW."name", 'A') ||
    search_tsv(NEW."originalName", 'A') ||
    search_tsv(coalesce(NEW."supplier", '') || ' ' || array_to_string(NEW."tags", ' '), 'B') ||
    search_tsv(left(NEW."ocrText", 200000), 'D');
  RETURN NEW;
END $$;

CREATE TRIGGER document_search_vector BEFORE INSERT OR UPDATE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION document_search_vector_update();
