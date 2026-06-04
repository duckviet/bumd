CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member', 'guest');
CREATE TYPE "DocVisibility" AS ENUM ('public', 'private');
CREATE TYPE "SourceFormat" AS ENUM ('openapi', 'asyncapi');
CREATE TYPE "VersionStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');
CREATE TYPE "VersionArtifactKind" AS ENUM ('normalized_spec', 'render_payload', 'search_document');
CREATE TYPE "DiffClassification" AS ENUM ('none', 'non_breaking', 'breaking');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('queued', 'delivered', 'retrying', 'failed');
CREATE TYPE "ProcessingJobType" AS ENUM ('parse', 'diff', 'render', 'search', 'webhooks');
CREATE TYPE "ProcessingJobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Organization_slug_key" UNIQUE ("slug")
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Membership_organizationId_userId_key" UNIQUE ("organizationId", "userId"),
  CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Doc" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visibility" "DocVisibility" NOT NULL,
  "defaultBranchId" TEXT,
  "themeConfig" JSONB,
  "customDomain" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Doc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Doc_organizationId_slug_key" UNIQUE ("organizationId", "slug"),
  CONSTRAINT "Doc_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Branch" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Branch_docId_slug_key" UNIQUE ("docId", "slug"),
  CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Branch_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Doc"
  ADD CONSTRAINT "Doc_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiToken_tokenPrefix_key" UNIQUE ("tokenPrefix"),
  CONSTRAINT "ApiToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Version" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "sourceFormat" "SourceFormat" NOT NULL,
  "rawSpecObjectKey" TEXT NOT NULL,
  "status" "VersionStatus" NOT NULL DEFAULT 'queued',
  "validationSummary" JSONB,
  "createdByUserId" TEXT,
  "createdByTokenId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),

  CONSTRAINT "Version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Version_docId_branchId_sha256_key" UNIQUE ("docId", "branchId", "sha256"),
  CONSTRAINT "Version_branchId_sequenceNumber_key" UNIQUE ("branchId", "sequenceNumber"),
  CONSTRAINT "Version_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Version_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Version_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Version_createdByTokenId_fkey" FOREIGN KEY ("createdByTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "VersionArtifact" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "kind" "VersionArtifactKind" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VersionArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VersionArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VersionArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Diff" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "baseVersionId" TEXT NOT NULL,
  "headVersionId" TEXT NOT NULL,
  "classification" "DiffClassification" NOT NULL,
  "summary" JSONB NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Diff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Diff_headVersionId_key" UNIQUE ("headVersionId"),
  CONSTRAINT "Diff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Diff_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Diff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Diff_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Diff_headVersionId_fkey" FOREIGN KEY ("headVersionId") REFERENCES "Version"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Webhook" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "secretRef" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "eventTypes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastStatusCode" INTEGER,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProcessingJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "jobKey" TEXT NOT NULL,
  "type" "ProcessingJobType" NOT NULL,
  "status" "ProcessingJobStatus" NOT NULL DEFAULT 'queued',
  "progress" JSONB,
  "error" JSONB,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcessingJob_jobKey_key" UNIQUE ("jobKey"),
  CONSTRAINT "ProcessingJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessingJob_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessingJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcessingJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "Version"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Doc_organizationId_idx" ON "Doc"("organizationId");
CREATE INDEX "Doc_defaultBranchId_idx" ON "Doc"("defaultBranchId");
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");
CREATE INDEX "Branch_docId_idx" ON "Branch"("docId");
CREATE INDEX "ApiToken_organizationId_idx" ON "ApiToken"("organizationId");
CREATE INDEX "ApiToken_role_idx" ON "ApiToken"("role");
CREATE INDEX "ApiToken_expiresAt_idx" ON "ApiToken"("expiresAt");
CREATE INDEX "ApiToken_revokedAt_idx" ON "ApiToken"("revokedAt");
CREATE INDEX "Version_organizationId_idx" ON "Version"("organizationId");
CREATE INDEX "Version_docId_idx" ON "Version"("docId");
CREATE INDEX "Version_branchId_idx" ON "Version"("branchId");
CREATE INDEX "Version_createdByUserId_idx" ON "Version"("createdByUserId");
CREATE INDEX "Version_createdByTokenId_idx" ON "Version"("createdByTokenId");
CREATE INDEX "Version_status_idx" ON "Version"("status");
CREATE INDEX "VersionArtifact_organizationId_idx" ON "VersionArtifact"("organizationId");
CREATE INDEX "VersionArtifact_versionId_idx" ON "VersionArtifact"("versionId");
CREATE INDEX "VersionArtifact_kind_idx" ON "VersionArtifact"("kind");
CREATE INDEX "VersionArtifact_contentSha256_idx" ON "VersionArtifact"("contentSha256");
CREATE INDEX "Diff_organizationId_idx" ON "Diff"("organizationId");
CREATE INDEX "Diff_docId_idx" ON "Diff"("docId");
CREATE INDEX "Diff_branchId_idx" ON "Diff"("branchId");
CREATE INDEX "Diff_baseVersionId_idx" ON "Diff"("baseVersionId");
CREATE INDEX "Diff_classification_idx" ON "Diff"("classification");
CREATE INDEX "Webhook_organizationId_idx" ON "Webhook"("organizationId");
CREATE INDEX "Webhook_enabled_idx" ON "Webhook"("enabled");
CREATE INDEX "WebhookDelivery_organizationId_idx" ON "WebhookDelivery"("organizationId");
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
CREATE INDEX "WebhookDelivery_eventId_idx" ON "WebhookDelivery"("eventId");
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");
CREATE INDEX "WebhookDelivery_nextAttemptAt_idx" ON "WebhookDelivery"("nextAttemptAt");
CREATE INDEX "ProcessingJob_organizationId_idx" ON "ProcessingJob"("organizationId");
CREATE INDEX "ProcessingJob_docId_idx" ON "ProcessingJob"("docId");
CREATE INDEX "ProcessingJob_branchId_idx" ON "ProcessingJob"("branchId");
CREATE INDEX "ProcessingJob_versionId_idx" ON "ProcessingJob"("versionId");
CREATE INDEX "ProcessingJob_type_idx" ON "ProcessingJob"("type");
CREATE INDEX "ProcessingJob_status_idx" ON "ProcessingJob"("status");

