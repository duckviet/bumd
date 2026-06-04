import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../apps/backend/prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../apps/backend/prisma/migrations/20260604230000_init/migration.sql",
  import.meta.url,
);

const expectedModels = [
  "Organization",
  "Membership",
  "Doc",
  "Branch",
  "Version",
  "VersionArtifact",
  "Diff",
  "Webhook",
  "WebhookDelivery",
  "ApiToken",
  "ProcessingJob",
];

const tenantOwnedModels = [
  "Membership",
  "Doc",
  "Branch",
  "Version",
  "VersionArtifact",
  "Diff",
  "Webhook",
  "WebhookDelivery",
  "ApiToken",
  "ProcessingJob",
];

const expectedEnums = [
  "MembershipRole",
  "DocVisibility",
  "SourceFormat",
  "VersionStatus",
  "VersionArtifactKind",
  "DiffClassification",
  "WebhookDeliveryStatus",
  "ProcessingJobType",
  "ProcessingJobStatus",
];

function readSchema() {
  return readFileSync(schemaPath, "utf8");
}

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function modelBlock(schema, modelName) {
  const expression = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, "u");
  const match = expression.exec(schema);
  assert.ok(match, `expected model ${modelName} to exist`);
  return match[1];
}

test("schema defines every SYSTEM_DESIGN.md model and tenant ownership field", () => {
  const schema = readSchema();

  for (const modelName of expectedModels) {
    assert.match(schema, new RegExp(`model ${modelName} \\{`, "u"));
  }

  for (const modelName of tenantOwnedModels) {
    const block = modelBlock(schema, modelName);
    assert.match(block, /\n\s+organizationId\s+String\b/u, `${modelName} must include organizationId`);
  }
});

test("schema defines required enums and immutable version identity constraints", () => {
  const schema = readSchema();
  const versionBlock = modelBlock(schema, "Version");

  for (const enumName of expectedEnums) {
    assert.match(schema, new RegExp(`enum ${enumName} \\{`, "u"));
  }

  assert.match(versionBlock, /\n\s+sha256\s+String\b/u);
  assert.match(versionBlock, /\n\s+rawSpecObjectKey\s+String\b/u);
  assert.match(versionBlock, /@@unique\(\[docId,\s*branchId,\s*sha256\]/u);
  assert.match(versionBlock, /@@unique\(\[branchId,\s*sequenceNumber\]/u);
});

test("schema stores secrets as references or hashes and never raw token values", () => {
  const schema = readSchema();
  const apiTokenBlock = modelBlock(schema, "ApiToken");
  const webhookBlock = modelBlock(schema, "Webhook");

  assert.match(apiTokenBlock, /\n\s+tokenHash\s+String\b/u);
  assert.match(apiTokenBlock, /\n\s+tokenPrefix\s+String\b/u);
  assert.doesNotMatch(apiTokenBlock, /\n\s+token\s+String\b/u);
  assert.match(webhookBlock, /\n\s+secretRef\s+String\b/u);
  assert.doesNotMatch(webhookBlock, /\n\s+secret\s+String\b/u);
});

test("migration creates PostgreSQL tables, enums, foreign keys, and unique constraints", () => {
  const migration = readMigration();

  for (const tableName of expectedModels) {
    assert.match(migration, new RegExp(`CREATE TABLE "${tableName}"`, "u"));
  }

  assert.match(migration, /CREATE TYPE "MembershipRole"/u);
  assert.match(migration, /CREATE TYPE "ProcessingJobType"/u);
  assert.match(migration, /CREATE TYPE "ProcessingJobStatus"/u);
  assert.match(migration, /CONSTRAINT "Version_docId_branchId_sha256_key" UNIQUE \("docId", "branchId", "sha256"\)/u);
  assert.match(migration, /CONSTRAINT "Version_branchId_sequenceNumber_key" UNIQUE \("branchId", "sequenceNumber"\)/u);
  assert.match(migration, /CONSTRAINT "ProcessingJob_jobKey_key" UNIQUE \("jobKey"\)/u);
  assert.match(migration, /FOREIGN KEY \("organizationId"\) REFERENCES "Organization"\("id"\)/u);
  assert.match(migration, /CREATE INDEX "WebhookDelivery_nextAttemptAt_idx"/u);
});
