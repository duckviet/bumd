import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;

import { createTestServer, createApiToken } from "./test-helper.mjs";

test("job status endpoint returns an organization-scoped processing job", async () => {
  const harness = await createTestServer();
  const pool = new Pool({
    connectionString: process.env["DATABASE_URL"] ?? "postgresql://bumd:bumd@localhost:5436/bumd",
  });
  const jobId = `job_status_test_${process.pid}`;

  try {
    const token = await createApiToken(harness, "admin", "acme", "job status test");
    await pool.query('DELETE FROM "ProcessingJob" WHERE id = $1', [jobId]);
    await pool.query(
      `INSERT INTO "ProcessingJob" (
        id, "organizationId", "docId", "branchId", "versionId", "jobKey", type, status, "attemptCount", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'org_acme', 'doc_payments', 'br_payments_main', 'ver_payments_1', $2, 'diff', 'queued', 0, NOW(), NOW()
      )`,
      [jobId, `version:ver_payments_1:diff:${jobId}`],
    );

    const response = await harness.inject({
      method: "GET",
      url: `/v1/orgs/acme/jobs/${jobId}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.statusCode, 200, response.payload);
    const body = JSON.parse(response.payload);
    assert.equal(body.id, jobId);
    assert.equal(body.type, "diff");
    assert.equal(body.status, "queued");
    assert.equal(body.versionId, "ver_payments_1");
    assert.equal(body.docId, "doc_payments");
    assert.equal(body.branchId, "br_payments_main");
    assert.equal(body.attemptCount, 0);
    assert.equal(body.error, null);
    assert.match(body.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/u);
  } finally {
    await pool.query('DELETE FROM "ProcessingJob" WHERE id = $1', [jobId]);
    await pool.end();
    await harness.close();
  }
});
