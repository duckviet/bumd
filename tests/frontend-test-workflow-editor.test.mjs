import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readFrontendSource(relativePath) {
  return fs.readFileSync(path.join(rootDir, "apps/frontend/src", relativePath), "utf8");
}

test("selected environment variables can be inserted from the workflow node inspector", () => {
  const pageSource = readFrontendSource("app/app/[org]/docs/[doc]/tests/tests-page-client.tsx");
  const inspectorSource = readFrontendSource("features/test-workflow-editor/ui/node-inspector.tsx");
  const requestEditorSource = readFrontendSource("features/test-workflow-editor/ui/request-template-editor.tsx");

  assert.match(pageSource, /<NodeInspector[\s\S]*environment=/u);
  assert.match(inspectorSource, /environment.*TestEnvironmentDto/u);
  assert.match(inspectorSource, /<RequestTemplateEditor[\s\S]*environment=/u);
  assert.match(requestEditorSource, /environment\.variables/u);
  assert.match(requestEditorSource, /`\{\{env\.\$\{[^}]+\}\}\}`/u);
  assert.match(requestEditorSource, /<select/u);
});

test("loading the current workflow does not dispatch again after save synchronization", () => {
  const pageSource = readFrontendSource("app/app/[org]/docs/[doc]/tests/tests-page-client.tsx");

  assert.match(pageSource, /if \(state\.workflowId === current\.id\) \{\s*return;\s*\}/u);
});
