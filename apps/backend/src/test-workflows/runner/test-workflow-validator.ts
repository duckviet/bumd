import type { TestWorkflowDefinition, TestWorkflowNode } from "../test-workflow-types.js";
import { parseAndValidateDefinition } from "../test-workflow-definition.schema.js";
import { collectTemplateRefs } from "./test-workflow-template.js";
import { getAncestors } from "./test-workflow-graph.js";
import { TestWorkflowError } from "../test-workflow-errors.js";
import { TestWorkflowErrorCode } from "../test-workflow-types.js";

/**
 * Save-time validation: structural check only.
 * Does NOT validate operationId existence.
 */
export function validateDefinitionStructure(raw: unknown): TestWorkflowDefinition {
  try {
    const def = parseAndValidateDefinition(raw);
    return def as TestWorkflowDefinition;
  } catch (err: unknown) {
    if (err instanceof Error) {
      const code = err.message === "WORKFLOW_CYCLE"
        ? TestWorkflowErrorCode.WorkflowCycle
        : TestWorkflowErrorCode.WorkflowInvalid;
      throw new TestWorkflowError(code, 400, err.message);
    }
    throw new TestWorkflowError(TestWorkflowErrorCode.WorkflowInvalid, 400, "Invalid workflow definition");
  }
}

/**
 * Run-time validation:
 * 1. All save-time validation.
 * 2. All operationIds exist in the OpenAPI spec.
 * 3. All {{env.KEY}} refs exist in the environment.
 * 4. All {{data.KEY}} refs exist in the saved workflow context.
 * 5. All {{vars.name}} refs point to ancestor node exports.
 */
export function validateDefinitionForRun(
  def: TestWorkflowDefinition,
  spec: unknown,
  envVarKeys: ReadonlySet<string>,
): void {
  // Collect all operationIds from spec
  const specOperationIds = extractOperationIds(spec);

  // Build map of export name -> nodeId for ancestor validation
  const exportToNode = new Map<string, string>();
  for (const node of def.nodes) {
    for (const exp of node.exports) {
      exportToNode.set(exp.name, node.id);
    }
  }

  for (const node of def.nodes) {
    // 1. Check operationId exists in spec
    if (!specOperationIds.has(node.operationId)) {
      throw new TestWorkflowError(
        TestWorkflowErrorCode.WorkflowStaleOperation,
        422,
        `Node "${node.id}" references operation "${node.operationId}" which does not exist in the latest-ready API version.`,
      );
    }

    // 2. Collect all template refs in this node's requestTemplate
    const refs = collectTemplateRefs(node.requestTemplate);

    // 3. Validate env refs
    for (const key of refs.envRefs) {
      if (!envVarKeys.has(key)) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.EnvVarMissing,
          422,
          `Node "${node.id}" references env var "{{env.${key}}}" which is not defined in the selected environment.`,
        );
      }
    }

    for (const key of refs.dataRefs) {
      if (!(key in def.context.testData)) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.TestDataMissing,
          422,
          `Node "${node.id}" references test data "{{data.${key}}}" which is not defined in the workflow context.`,
        );
      }
    }

    const ancestors = getAncestors(node.id, def.edges);
    for (const varName of refs.varRefs) {
      const ownerNodeId = exportToNode.get(varName);
      if (ownerNodeId === undefined) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.VarRefInvalid,
          422,
          `Node "${node.id}" references var "{{vars.${varName}}}" which is not exported by any node.`,
        );
      }
      if (!ancestors.has(ownerNodeId)) {
        throw new TestWorkflowError(
          TestWorkflowErrorCode.VarRefNotAncestor,
          422,
          `Node "${node.id}" references var "{{vars.${varName}}}" from node "${ownerNodeId}" which is not an ancestor.`,
        );
      }
    }
  }
}

function extractOperationIds(spec: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(spec)) return ids;
  const paths = spec["paths"];
  if (!isRecord(paths)) return ids;
  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const op = pathItem[method];
      if (isRecord(op) && typeof op["operationId"] === "string") {
        ids.add(op["operationId"]);
      }
    }
  }
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
