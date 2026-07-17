import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getPhaseConnectionError,
  workflowPhases,
} from "../apps/frontend/src/features/test-workflow-editor/model/workflow-phases.ts";
import {
  createInitialEditorState,
  workflowEditorReducer,
} from "../apps/frontend/src/features/test-workflow-editor/model/workflow-editor-state.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readFrontendSource(relativePath) {
  return fs.readFileSync(path.join(rootDir, "apps/frontend/src", relativePath), "utf8");
}

const node = (id, phase) => ({
  id,
  type: "endpoint",
  operationId: `${id}-operation`,
  method: "GET",
  path: `/${id}`,
  label: id,
  phase,
  position: { x: 0, y: 0 },
  requestTemplate: {},
  exports: [],
  assertions: [],
});

test("phases expose setup, test, and teardown semantics in execution order", () => {
  assert.deepEqual(workflowPhases.map(({ value }) => value), ["setup", "test", "teardown"]);
  assert.match(workflowPhases[0].description, /before test nodes/u);
  assert.match(workflowPhases[1].description, /main verification/u);
  assert.match(workflowPhases[2].description, /cleanup/u);
});

test("new nodes default to test phase and phase edits survive save reload", () => {
  const added = workflowEditorReducer(createInitialEditorState(), {
    type: "ADD_NODE",
    node: {
      id: "new-node",
      type: "endpoint",
      operationId: "listPets",
      method: "GET",
      path: "/pets",
      label: "List pets",
      position: { x: 0, y: 0 },
      requestTemplate: {},
      exports: [],
      assertions: [],
    },
  });
  assert.equal(added.definition.nodes[0]?.phase, "test");

  const editedDefinition = {
    ...added.definition,
    nodes: added.definition.nodes.map((item) => ({ ...item, phase: "teardown" })),
  };
  const edited = workflowEditorReducer(added, { type: "SET_NODES", nodes: editedDefinition.nodes });
  const saved = workflowEditorReducer(edited, {
    type: "SAVE_SUCCESS",
    workflow: {
      id: "workflow-one",
      name: "Phase workflow",
      slug: "phase-workflow",
      description: null,
      tags: [],
      priority: "medium",
      type: "integration",
      definitionJson: editedDefinition,
      revision: 2,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:01:00.000Z",
    },
  });
  assert.equal(saved.definition.nodes[0]?.phase, "teardown");
  assert.equal(saved.dirty, false);
});

test("phase-regressing edges are rejected with feedback and graph state stays unchanged", () => {
  const nodes = [node("setup", "setup"), node("test", "test"), node("cleanup", "teardown")];
  assert.equal(getPhaseConnectionError(nodes, "setup", "test"), null);
  assert.equal(getPhaseConnectionError(nodes, "test", "cleanup"), null);
  assert.match(getPhaseConnectionError(nodes, "cleanup", "test") ?? "", /teardown.*test/u);
  assert.match(getPhaseConnectionError(nodes, "cleanup", "setup") ?? "", /teardown.*setup/u);
  assert.match(getPhaseConnectionError(nodes, "test", "setup") ?? "", /test.*setup/u);
  assert.match(getPhaseConnectionError(nodes, "missing", "test") ?? "", /refresh/iu);

  const initial = workflowEditorReducer(createInitialEditorState(), { type: "SET_NODES", nodes });
  const phaseError = getPhaseConnectionError(nodes, "cleanup", "test");
  const next = phaseError
    ? initial
    : workflowEditorReducer(initial, {
      type: "ADD_EDGE",
      edge: { id: "invalid", source: "cleanup", target: "test" },
    });
  assert.deepEqual(next.definition.edges, initial.definition.edges);
  assert.equal(next.definition.edges.length, 0);
});

test("inspector and canvas expose phase controls, badges, legend, and exact React Flow event types", () => {
  const inspectorSource = readFrontendSource("features/test-workflow-editor/ui/node-inspector.tsx");
  const canvasSource = readFrontendSource("widgets/test-workflow-canvas/ui/test-workflow-canvas.tsx");
  const endpointSource = readFrontendSource("widgets/test-workflow-canvas/ui/endpoint-node.tsx");

  assert.match(inspectorSource, /"general"/u);
  assert.match(inspectorSource, /<select[\s\S]*node\.phase/u);
  assert.match(inspectorSource, /onUpdateNode\(node\.id, \{ phase:/u);
  assert.match(canvasSource, /Phase legend/u);
  assert.match(canvasSource, /phase: n\.phase/u);
  assert.match(canvasSource, /if \(phaseError\)[\s\S]*setConnectionError\(phaseError\)[\s\S]*return;/u);
  assert.match(canvasSource, /NodeMouseHandler/u);
  assert.doesNotMatch(canvasSource, /_event:\s*any/u);
  assert.match(endpointSource, /data\.phase/u);
  assert.match(endpointSource, /getPhaseBadgeClass/u);
});
