import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "apps/frontend/src");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

test("frontend presentation uses Tailwind utilities instead of legacy or inline styles", () => {
  const violations = [];
  const legacyClass = /class(?:Name)?="[^"]*(?:dashboard-|test-workflow-|tw-canvas-|button-primary|button-secondary|error-msg)/u;

  for (const file of sourceFiles(sourceDir)) {
    const source = fs.readFileSync(file, "utf8");
    const relativeFile = path.relative(rootDir, file);

    if (file.endsWith(".tsx") && /style=\{/u.test(source)) violations.push(`${relativeFile}: React inline style`);
    if (/style="/u.test(source)) violations.push(`${relativeFile}: generated inline style`);
    if (file.endsWith(".tsx") && /#[0-9a-fA-F]{3,8}/u.test(source)) violations.push(`${relativeFile}: raw color literal`);
    if (legacyClass.test(source)) violations.push(`${relativeFile}: legacy semantic class`);
    if (/\b(?:bg|text|border|ring|shadow|accent)--[\w-]+/u.test(source)) violations.push(`${relativeFile}: malformed Tailwind utility`);
  }

  assert.deepEqual(violations, []);
  assert.equal(fs.existsSync(path.join(sourceDir, "app/dashboard.css")), false);
});
