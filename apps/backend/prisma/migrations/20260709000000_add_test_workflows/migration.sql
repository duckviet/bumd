-- CreateTable: TestWorkflow
CREATE TABLE "TestWorkflow" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "docId"           TEXT NOT NULL,
    "branchId"        TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "description"     TEXT,
    "definitionJson"  JSONB NOT NULL,
    "revision"        INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "deletedAt"       TIMESTAMP(3),

    CONSTRAINT "TestWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TestEnvironment
CREATE TABLE "TestEnvironment" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "docId"          TEXT NOT NULL,
    "branchId"       TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "isDefault"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "TestEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TestEnvironmentVariable
CREATE TABLE "TestEnvironmentVariable" (
    "id"             TEXT NOT NULL,
    "environmentId"  TEXT NOT NULL,
    "key"            TEXT NOT NULL,
    "encryptedValue" TEXT,
    "secret"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestEnvironmentVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TestWorkflowRun
CREATE TABLE "TestWorkflowRun" (
    "id"                     TEXT NOT NULL,
    "workflowId"             TEXT NOT NULL,
    "organizationId"         TEXT NOT NULL,
    "docId"                  TEXT NOT NULL,
    "branchId"               TEXT NOT NULL,
    "versionId"              TEXT NOT NULL,
    "environmentId"          TEXT,
    "status"                 TEXT NOT NULL,
    "startedByUserId"        TEXT,
    "startedByTokenId"       TEXT,
    "definitionSnapshotJson" JSONB NOT NULL,
    "cancelRequestedAt"      TIMESTAMP(3),
    "startedAt"              TIMESTAMP(3),
    "finishedAt"             TIMESTAMP(3),
    "durationMs"             INTEGER,
    "errorCode"              TEXT,
    "errorMessage"           TEXT,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TestWorkflowStepRun
CREATE TABLE "TestWorkflowStepRun" (
    "id"             TEXT NOT NULL,
    "runId"          TEXT NOT NULL,
    "nodeId"         TEXT NOT NULL,
    "operationId"    TEXT NOT NULL,
    "status"         TEXT NOT NULL,
    "requestJson"    JSONB,
    "responseJson"   JSONB,
    "assertionsJson" JSONB,
    "exportsJson"    JSONB,
    "inputsJson"     JSONB,
    "startedAt"      TIMESTAMP(3),
    "finishedAt"     TIMESTAMP(3),
    "durationMs"     INTEGER,
    "errorCode"      TEXT,
    "errorMessage"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestWorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: TestWorkflow
CREATE UNIQUE INDEX "TestWorkflow_docId_branchId_slug_key" ON "TestWorkflow"("docId", "branchId", "slug");
CREATE INDEX "TestWorkflow_organizationId_docId_branchId_idx" ON "TestWorkflow"("organizationId", "docId", "branchId");
CREATE INDEX "TestWorkflow_organizationId_docId_branchId_deletedAt_idx" ON "TestWorkflow"("organizationId", "docId", "branchId", "deletedAt");

-- CreateIndex: TestEnvironment
CREATE UNIQUE INDEX "TestEnvironment_docId_branchId_name_key" ON "TestEnvironment"("docId", "branchId", "name");
CREATE INDEX "TestEnvironment_organizationId_docId_branchId_idx" ON "TestEnvironment"("organizationId", "docId", "branchId");

-- CreateIndex: TestEnvironmentVariable
CREATE UNIQUE INDEX "TestEnvironmentVariable_environmentId_key_key" ON "TestEnvironmentVariable"("environmentId", "key");
CREATE INDEX "TestEnvironmentVariable_environmentId_idx" ON "TestEnvironmentVariable"("environmentId");

-- CreateIndex: TestWorkflowRun
CREATE INDEX "TestWorkflowRun_workflowId_createdAt_idx" ON "TestWorkflowRun"("workflowId", "createdAt");
CREATE INDEX "TestWorkflowRun_organizationId_docId_branchId_createdAt_idx" ON "TestWorkflowRun"("organizationId", "docId", "branchId", "createdAt");
CREATE INDEX "TestWorkflowRun_status_idx" ON "TestWorkflowRun"("status");

-- CreateIndex: TestWorkflowStepRun
CREATE UNIQUE INDEX "TestWorkflowStepRun_runId_nodeId_key" ON "TestWorkflowStepRun"("runId", "nodeId");
CREATE INDEX "TestWorkflowStepRun_runId_idx" ON "TestWorkflowStepRun"("runId");
CREATE INDEX "TestWorkflowStepRun_status_idx" ON "TestWorkflowStepRun"("status");

-- AddForeignKey: TestEnvironmentVariable -> TestEnvironment
ALTER TABLE "TestEnvironmentVariable"
    ADD CONSTRAINT "TestEnvironmentVariable_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "TestEnvironment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TestWorkflowRun -> TestWorkflow
ALTER TABLE "TestWorkflowRun"
    ADD CONSTRAINT "TestWorkflowRun_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "TestWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: TestWorkflowRun -> TestEnvironment
ALTER TABLE "TestWorkflowRun"
    ADD CONSTRAINT "TestWorkflowRun_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "TestEnvironment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: TestWorkflowStepRun -> TestWorkflowRun
ALTER TABLE "TestWorkflowStepRun"
    ADD CONSTRAINT "TestWorkflowStepRun_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "TestWorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
