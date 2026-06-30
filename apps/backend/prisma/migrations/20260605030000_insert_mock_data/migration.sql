-- Insert organizations
INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt") VALUES
('org_acme', 'acme', 'Acme Corp', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('org_other', 'other', 'Other Corp', '2026-06-05 00:00:00', '2026-06-05 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert memberships
INSERT INTO "Membership" (id, "organizationId", "userId", role, "createdAt", "updatedAt") VALUES
('mem_1', 'org_acme', 'usr_1', 'owner', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('mem_2', 'org_acme', 'usr_2', 'member', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('mem_3', 'org_acme', 'usr_3', 'guest', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('mem_4', 'org_other', 'usr_4', 'owner', '2026-06-05 00:00:00', '2026-06-05 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert docs
INSERT INTO "Doc" (id, "organizationId", slug, name, visibility, "defaultBranchId", "themeConfig", "createdAt", "updatedAt") VALUES
('doc_payments', 'org_acme', 'payments', 'Payments API', 'public', NULL, '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('doc_private', 'org_acme', 'private-doc', 'Private API', 'private', NULL, '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('doc_empty', 'org_acme', 'empty', 'Empty API', 'public', NULL, '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('doc_other', 'org_other', 'other-api', 'Other API', 'private', NULL, '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert branches
INSERT INTO "Branch" (id, "organizationId", "docId", name, slug, "createdAt", "updatedAt") VALUES
('br_payments_main', 'org_acme', 'doc_payments', 'main', 'main', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('br_private_main', 'org_acme', 'doc_private', 'main', 'main', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('br_empty_main', 'org_acme', 'doc_empty', 'main', 'main', '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('br_other_main', 'org_other', 'doc_other', 'main', 'main', '2026-06-05 00:00:00', '2026-06-05 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- Update Doc default branch IDs
UPDATE "Doc" SET "defaultBranchId" = 'br_payments_main' WHERE id = 'doc_payments';
UPDATE "Doc" SET "defaultBranchId" = 'br_private_main' WHERE id = 'doc_private';
UPDATE "Doc" SET "defaultBranchId" = 'br_empty_main' WHERE id = 'doc_empty';
UPDATE "Doc" SET "defaultBranchId" = 'br_other_main' WHERE id = 'doc_other';

-- Insert versions
INSERT INTO "Version" (id, "organizationId", "docId", "branchId", "sequenceNumber", sha256, "sourceFormat", "rawSpecObjectKey", status, "validationSummary", "createdAt", "readyAt") VALUES
('ver_payments_1', 'org_acme', 'doc_payments', 'br_payments_main', 1, 'sha256_payments_v1', 'openapi', 'raw_specs/payments_1.yaml', 'ready', '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('ver_payments_2', 'org_acme', 'doc_payments', 'br_payments_main', 2, 'sha256_payments_v2', 'openapi', 'raw_specs/payments_2.yaml', 'ready', '{}'::jsonb, '2026-06-05 01:00:00', '2026-06-05 01:00:00'),
('ver_payments_3', 'org_acme', 'doc_payments', 'br_payments_main', 3, 'sha256_payments_v3', 'openapi', 'raw_specs/payments_3.yaml', 'processing', '{}'::jsonb, '2026-06-05 02:00:00', NULL),
('ver_private_1', 'org_acme', 'doc_private', 'br_private_main', 1, 'sha256_private_v1', 'openapi', 'raw_specs/private_1.yaml', 'ready', '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00'),
('ver_other_1', 'org_other', 'doc_other', 'br_other_main', 1, 'sha256_other_v1', 'openapi', 'raw_specs/other_1.yaml', 'ready', '{}'::jsonb, '2026-06-05 00:00:00', '2026-06-05 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert version artifacts
INSERT INTO "VersionArtifact" (id, "organizationId", "versionId", kind, "objectKey", "contentSha256", "createdAt") VALUES
('art_1', 'org_acme', 'ver_payments_1', 'normalized_spec', 'normalized/payments_1.json', 'sha256_payments_v1_norm', '2026-06-05 00:00:00'),
('art_2', 'org_acme', 'ver_payments_2', 'normalized_spec', 'normalized/payments_2.json', 'sha256_payments_v2_norm', '2026-06-05 01:00:00')
ON CONFLICT (id) DO NOTHING;

-- Insert diffs
INSERT INTO "Diff" (id, "organizationId", "docId", "branchId", "baseVersionId", "headVersionId", classification, has_breaking, diff_json, diff_markdown, summary, changes, "createdAt") VALUES
('diff_1', 'org_acme', 'doc_payments', 'br_payments_main', 'ver_payments_1', 'ver_payments_2', 'breaking', true, '{"breaking": true}'::jsonb, '## Breaking changes\n- Removed `legacyPaymentId` from the payment response.', '{}'::jsonb, '[]'::jsonb, '2026-06-05 01:00:00')
ON CONFLICT (id) DO NOTHING;
