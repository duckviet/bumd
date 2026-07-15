import type {
  JsonValue,
  TestWorkflowDefinition,
  TestWorkflowPriority,
  TestWorkflowType,
  UpdateTestWorkflowBody,
} from "../../../shared/api/test-workflow-types.ts";

export type TestDataRow = {
  readonly key: string;
  readonly value: string;
};

export type WorkflowSettingsInput = {
  readonly name: string;
  readonly description: string;
  readonly tagsText: string;
  readonly priority: TestWorkflowPriority;
  readonly type: TestWorkflowType;
  readonly testDataRows: readonly TestDataRow[];
};

export type WorkflowSettings = {
  readonly name: string;
  readonly description: string | null;
  readonly tags: readonly string[];
  readonly priority: TestWorkflowPriority;
  readonly type: TestWorkflowType;
  readonly testData: Readonly<Record<string, JsonValue>>;
};

export type WorkflowSettingsErrors = {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: string;
  readonly testData?: string;
  readonly rows: Readonly<Record<number, string>>;
};

export type WorkflowSettingsValidation =
  | { readonly ok: true; readonly settings: WorkflowSettings }
  | { readonly ok: false; readonly errors: WorkflowSettingsErrors };

const tagPattern = /^[a-z0-9][a-z0-9-]*$/u;
const testDataKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;
const maxTestDataEntries = 100;
const maxTestDataBytes = 65_536;

function parseTags(tagsText: string): readonly string[] {
  return tagsText
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function parseTestData(rows: readonly TestDataRow[]): {
  readonly testData: Readonly<Record<string, JsonValue>>;
  readonly rowErrors: Readonly<Record<number, string>>;
} {
  const testData: Record<string, JsonValue> = {};
  const rowErrors: Record<number, string> = {};
  const keys = new Set<string>();

  rows.forEach((row, index) => {
    const key = row.key.trim();
    if (!testDataKeyPattern.test(key)) {
      rowErrors[index] = "Use a letter or underscore first, then letters, numbers, or underscores.";
      return;
    }
    if (keys.has(key)) {
      rowErrors[index] = "Test data keys must be unique.";
      return;
    }
    keys.add(key);
    try {
      const value: unknown = JSON.parse(row.value);
      if (isJsonValue(value)) {
        testData[key] = value;
      } else {
        rowErrors[index] = "Enter a valid JSON value.";
      }
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        rowErrors[index] = "Enter a valid JSON value.";
      } else {
        throw error;
      }
    }
  });

  return { testData, rowErrors };
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

export function validateWorkflowSettings(input: WorkflowSettingsInput): WorkflowSettingsValidation {
  const name = input.name.trim();
  const description = input.description.trim();
  const tags = parseTags(input.tagsText);
  const { testData, rowErrors } = parseTestData(input.testDataRows);
  const nameError = name.length === 0
    ? "Workflow name is required."
    : name.length > 200 ? "Workflow name must be 200 characters or fewer." : undefined;
  const descriptionError = description.length > 1000
    ? "Description must be 1,000 characters or fewer."
    : undefined;
  const tagsError = tags.some((tag) => !tagPattern.test(tag))
    ? "Tags must be lowercase letters, numbers, and dashes."
    : undefined;
  const testDataBytes = new TextEncoder().encode(JSON.stringify(testData)).byteLength;
  const testDataError = input.testDataRows.length > maxTestDataEntries
    ? "Test data supports at most 100 entries."
    : testDataBytes > maxTestDataBytes ? "Test data must be 64 KiB or smaller." : undefined;

  if (nameError || descriptionError || tagsError || testDataError || Object.keys(rowErrors).length > 0) {
    return {
      ok: false,
      errors: {
        ...(nameError ? { name: nameError } : {}),
        ...(descriptionError ? { description: descriptionError } : {}),
        ...(tagsError ? { tags: tagsError } : {}),
        ...(testDataError ? { testData: testDataError } : {}),
        rows: rowErrors,
      },
    };
  }

  return {
    ok: true,
    settings: {
      name,
      description: description.length === 0 ? null : description,
      tags,
      priority: input.priority,
      type: input.type,
      testData,
    },
  };
}

export function testDataToRows(testData: Readonly<Record<string, JsonValue>>): readonly TestDataRow[] {
  return Object.entries(testData).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
}

export function buildWorkflowUpdateBody(input: {
  readonly revision: number;
  readonly definition: TestWorkflowDefinition;
  readonly settings: WorkflowSettings;
}): UpdateTestWorkflowBody {
  return {
    expectedRevision: input.revision,
    name: input.settings.name,
    description: input.settings.description,
    tags: input.settings.tags,
    priority: input.settings.priority,
    type: input.settings.type,
    definitionJson: {
      ...input.definition,
      context: { testData: input.settings.testData },
    },
  };
}
