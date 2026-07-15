import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildWorkflowUpdateBody,
  validateWorkflowSettings,
} from "../apps/frontend/src/features/test-workflow-editor/model/workflow-settings.ts";
import {
  createInitialEditorState,
  workflowEditorReducer,
} from "../apps/frontend/src/features/test-workflow-editor/model/workflow-editor-state.ts";
import "./helpers/frontend-test-workflow-verifier-cases.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readFrontendSource(relativePath) {
  return fs.readFileSync(path.join(rootDir, "apps/frontend/src", relativePath), "utf8");
}

test("selected environment variables can be inserted from the workflow node inspector", () => {
  const pageSource = readFrontendSource("app/app/[org]/docs/[doc]/tests/tests-page-client.tsx");
  const workspaceSource = readFrontendSource("app/app/[org]/docs/[doc]/tests/workflow-editor-workspace.tsx");
  const inspectorSource = readFrontendSource("features/test-workflow-editor/ui/node-inspector.tsx");
  const requestEditorSource = readFrontendSource("features/test-workflow-editor/ui/request-template-editor.tsx");
  const pickerSource = readFrontendSource("features/test-workflow-editor/ui/workflow-variable-picker.tsx");

  assert.match(pageSource, /<WorkflowEditorWorkspace[\s\S]*environment=/u);
  assert.match(workspaceSource, /<NodeInspector[\s\S]*environment=/u);
  assert.match(inspectorSource, /environment.*TestEnvironmentDto/u);
  assert.match(inspectorSource, /<RequestTemplateEditor[\s\S]*environment=/u);
  assert.match(pickerSource, /environment\.variables/u);
  assert.match(pickerSource, /`\{\{env\.\$\{[^}]+\}\}\}`/u);
  assert.match(pickerSource, /<select/u);
});

test("loading the current workflow does not dispatch again after save synchronization", () => {
  const pageSource = readFrontendSource("app/app/[org]/docs/[doc]/tests/tests-page-client.tsx");

  assert.match(pageSource, /if \(state\.workflowId === current\.id\) \{\s*return;\s*\}/u);
});

test("dashboard workflow projection carries the exact v2 metadata contract", () => {
  const dashboardClientSource = readFrontendSource("shared/api/dashboard-management-client.ts");
  const backendSource = fs.readFileSync(
    path.join(rootDir, "apps/backend/src/catalog/dashboard-docs.service.ts"),
    "utf8",
  );

  assert.match(dashboardClientSource, /tags: z\.array\(z\.string\(\)\)/u);
  assert.match(dashboardClientSource, /priority: z\.enum\(\["low", "medium", "high", "critical"\]\)/u);
  assert.match(dashboardClientSource, /type: z\.enum\(\["smoke", "integration", "end_to_end", "contract"\]\)/u);
  assert.match(backendSource, /SELECT id, name, slug, description, tags, priority::text AS priority, type::text AS type/u);
});

const workflow = (overrides = {}) => ({
  id: "workflow-one",
  name: "Checkout smoke",
  slug: "checkout-smoke",
  description: "Core checkout path",
  tags: ["checkout", "critical-path"],
  priority: "high",
  type: "smoke",
  definitionJson: {
    schemaVersion: 2,
    context: { testData: { accountId: 42, enabled: true } },
    nodes: [],
    edges: [],
  },
  revision: 3,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  ...overrides,
});

test("workflow metadata and testData participate in dirty and save synchronization", () => {
  const loaded = workflowEditorReducer(createInitialEditorState(), {
    type: "LOAD_WORKFLOW",
    workflow: workflow(),
  });
  assert.equal(loaded.dirty, false);
  assert.deepEqual(loaded.metadata.tags, ["checkout", "critical-path"]);
  assert.deepEqual(loaded.definition.context.testData, { accountId: 42, enabled: true });

  const edited = workflowEditorReducer(loaded, {
    type: "UPDATE_SETTINGS",
    settings: {
      name: "Checkout contract",
      description: null,
      tags: ["checkout", "release"],
      priority: "critical",
      type: "contract",
      testData: { accountId: 84, region: "eu" },
    },
  });
  assert.equal(edited.dirty, true);
  assert.equal(edited.name, "Checkout contract");
  assert.deepEqual(edited.definition.context.testData, { accountId: 84, region: "eu" });

  const savedWorkflow = workflow({
    name: "Checkout contract",
    description: null,
    tags: ["checkout", "release"],
    priority: "critical",
    type: "contract",
    definitionJson: edited.definition,
    revision: 4,
  });
  const saved = workflowEditorReducer(edited, { type: "SAVE_SUCCESS", workflow: savedWorkflow });
  assert.equal(saved.dirty, false);
  assert.equal(saved.revision, 4);
  assert.deepEqual(saved.metadata, {
    tags: ["checkout", "release"],
    priority: "critical",
    type: "contract",
  });
});

test("switching and conflict reload replace all editable workflow state", () => {
  const first = workflowEditorReducer(createInitialEditorState(), {
    type: "LOAD_WORKFLOW",
    workflow: workflow(),
  });
  const dirty = workflowEditorReducer(first, {
    type: "UPDATE_SETTINGS",
    settings: {
      name: "Unsaved local name",
      description: "local",
      tags: ["local"],
      priority: "low",
      type: "integration",
      testData: { localOnly: true },
    },
  });
  const second = workflow({
    id: "workflow-two",
    name: "Server workflow",
    tags: ["server"],
    priority: "medium",
    type: "end_to_end",
    definitionJson: {
      schemaVersion: 2,
      context: { testData: { serverOnly: "yes" } },
      nodes: [],
      edges: [],
    },
    revision: 9,
  });
  const reloaded = workflowEditorReducer(dirty, { type: "LOAD_WORKFLOW", workflow: second });
  assert.equal(reloaded.workflowId, "workflow-two");
  assert.equal(reloaded.name, "Server workflow");
  assert.equal(reloaded.dirty, false);
  assert.deepEqual(reloaded.definition.context.testData, { serverOnly: "yes" });
  assert.equal(reloaded.conflictRevision, null);
});

test("settings validation rejects malformed, duplicate, and oversized data", () => {
  const validBase = {
    name: "Workflow",
    description: "",
    tagsText: "smoke, release",
    priority: "medium",
    type: "integration",
  };

  assert.equal(validateWorkflowSettings({
    ...validBase,
    testDataRows: [{ key: "bad-key", value: "true" }],
  }).ok, false);
  assert.equal(validateWorkflowSettings({
    ...validBase,
    testDataRows: [
      { key: "accountId", value: "1" },
      { key: "accountId", value: "2" },
    ],
  }).ok, false);
  assert.equal(validateWorkflowSettings({
    ...validBase,
    testDataRows: [{ key: "accountId", value: "{broken" }],
  }).ok, false);
  assert.equal(validateWorkflowSettings({
    ...validBase,
    testDataRows: [{ key: "payload", value: JSON.stringify("x".repeat(65_536)) }],
  }).ok, false);
  assert.equal(validateWorkflowSettings({
    ...validBase,
    tagsText: "valid, Invalid tag!",
    testDataRows: [],
  }).ok, false);
});

test("valid settings build the exact v2 PATCH body", () => {
  const result = validateWorkflowSettings({
    name: "  Contract workflow  ",
    description: "  release contract  ",
    tagsText: "Release, api",
    priority: "high",
    type: "contract",
    testDataRows: [
      { key: "accountId", value: "42" },
      { key: "fixture", value: "{\"active\":true}" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const body = buildWorkflowUpdateBody({
    revision: 7,
    definition: {
      schemaVersion: 2,
      context: { testData: {} },
      nodes: [],
      edges: [],
    },
    settings: result.settings,
  });
  assert.deepEqual(body, {
    expectedRevision: 7,
    name: "Contract workflow",
    description: "release contract",
    tags: ["release", "api"],
    priority: "high",
    type: "contract",
    definitionJson: {
      schemaVersion: 2,
      context: {
        testData: { accountId: 42, fixture: { active: true } },
      },
      nodes: [],
      edges: [],
    },
  });
});

test("the variable picker exposes data and env namespaces without inventing vars", () => {
  const pickerSource = readFrontendSource("features/test-workflow-editor/ui/workflow-variable-picker.tsx");
  assert.match(pickerSource, /dataVariableTemplate/u);
  assert.match(pickerSource, /Environment variables/u);
  assert.match(pickerSource, /Test data/u);
  assert.doesNotMatch(pickerSource, /varsVariableTemplate/u);
  assert.doesNotMatch(pickerSource, /text-\[10px\]/u);
  assert.match(pickerSource, /h-10/u);
});

test("workflow settings use an accessible dialog and stack test data rows on mobile", () => {
  const modalSource = readFrontendSource("shared/ui/dashboard-modal.tsx");
  const primitivesSource = readFrontendSource("shared/ui/dashboard-primitives.tsx");
  const settingsSource = readFrontendSource("features/test-workflow-editor/ui/workflow-settings-modal.tsx");

  assert.match(modalSource, /aria-modal="true"/u);
  assert.match(modalSource, /aria-labelledby=\{titleId\}/u);
  assert.match(modalSource, /event\.key === "Escape"/u);
  assert.match(modalSource, /previouslyFocused\?\.focus\(\)/u);
  assert.doesNotMatch(modalSource, /shadow-xl/u);
  assert.match(primitivesSource, /font-polysans text-xl font-normal/u);
  assert.match(settingsSource, /grid-cols-1[^"]*sm:grid-cols-/u);
});

test("run console reports immutable context and phase-aware outcomes", () => {
  const consoleSource = readFrontendSource("features/test-workflow-run/ui/run-console.tsx");
  const tabsSource = readFrontendSource("features/test-workflow-run/ui/console-tabs.tsx");
  const modelSource = readFrontendSource("features/test-workflow-run/model/run-console-model.ts");
  const typesSource = readFrontendSource("shared/api/test-workflow-types.ts");

  assert.match(typesSource, /metadataSnapshot: TestWorkflowMetadata/u);
  assert.match(typesSource, /environmentSnapshot: TestEnvironmentSnapshotDescriptor \| null/u);
  assert.match(typesSource, /phase: TestWorkflowNodePhase/u);
  assert.match(consoleSource, /metadataSnapshot\.priority/u);
  assert.match(consoleSource, /environmentSnapshot\?\.name/u);
  assert.match(consoleSource, /environmentSnapshot\?\.variables\.map/u);
  assert.match(consoleSource, /variable\.hasValue/u);
  assert.match(modelSource, /\["setup", "test", "teardown"\]/u);
  assert.match(consoleSource, /Primary run error/u);
  assert.match(consoleSource, /Teardown failures/u);
  assert.match(tabsSource, /input\.type === "data"/u);
  assert.match(tabsSource, /\{\{data\./u);
  assert.doesNotMatch(consoleSource + tabsSource, /encryptedValue|test_raw_secret|test_ciphertext|enc:/u);
});

test("run console model keeps primary and teardown errors distinct", async () => {
  const { groupRunStepsByPhase, summarizeRunErrors } = await import(
    "../apps/frontend/src/features/test-workflow-run/model/run-console-model.ts"
  );
  const run = {
    error: { code: "ASSERTION_FAILED", message: "Primary assertion failed" },
    steps: [
      { id: "setup", nodeId: "setup", phase: "setup", error: null },
      { id: "test", nodeId: "test", phase: "test", error: { code: "ASSERTION_FAILED", message: "failed" } },
      { id: "cleanup", nodeId: "cleanup", phase: "teardown", error: { code: "REQUEST_FAILED", message: "cleanup failed" } },
    ],
  };

  assert.deepEqual(groupRunStepsByPhase(run.steps).map((group) => [group.phase, group.steps.length]), [
    ["setup", 1],
    ["test", 1],
    ["teardown", 1],
  ]);
  assert.deepEqual(summarizeRunErrors(run), {
    primaryError: run.error,
    teardownFailures: [{ nodeId: "cleanup", error: run.steps[2].error }],
  });
  assert.deepEqual(summarizeRunErrors({ ...run, error: { code: "TEARDOWN_FAILED", message: "cleanup failed" } }), {
    primaryError: null,
    teardownFailures: [{ nodeId: "cleanup", error: run.steps[2].error }],
  });
});
