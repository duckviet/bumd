CREATE TYPE "TestWorkflowPriority" AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE "TestWorkflowType" AS ENUM ('smoke', 'integration', 'end_to_end', 'contract');

ALTER TABLE "TestWorkflow"
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "priority" "TestWorkflowPriority" NOT NULL DEFAULT 'medium',
    ADD COLUMN "type" "TestWorkflowType" NOT NULL DEFAULT 'integration';

ALTER TABLE "TestWorkflowRun"
    ADD COLUMN "metadataSnapshotJson" JSONB NOT NULL DEFAULT '{"tags":[],"priority":"medium","type":"integration"}'::JSONB,
    ADD COLUMN "environmentSnapshotJson" JSONB;

ALTER TABLE "TestWorkflowStepRun"
    ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'test';
