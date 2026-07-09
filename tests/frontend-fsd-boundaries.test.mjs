import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const SRC_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../apps/frontend/src");

const LAYERS = ["shared", "entities", "features", "widgets", "pages", "app"];

function getLayerIndex(layer) {
  return LAYERS.indexOf(layer);
}

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(res));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(res);
    }
  }
  return files;
}

function parseImports(fileContent) {
  const imports = [];
  const regexes = [
    /import\s+(?:type\s+)?(?:\*\s+as\s+\w+\s+from\s+)?(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(['"]([^'"]+)['"]\)/g,
    /export\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g,
  ];

  for (const regex of regexes) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(fileContent)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
  }
  return imports;
}

function resolveImport(importingFile, importPath) {
  if (!importPath.startsWith(".")) {
    return null;
  }
  const resolved = path.resolve(path.dirname(importingFile), importPath);
  if (!resolved.startsWith(SRC_DIR)) {
    return null;
  }
  return resolved;
}

function getLayerAndSlice(absolutePath) {
  const relative = path.relative(SRC_DIR, absolutePath);
  const parts = relative.split(path.sep);
  const layer = parts[0];
  const slice = parts[1];
  return { layer, slice };
}

function isIndexFile(absolutePath) {
  const basename = path.basename(absolutePath);
  return basename === "index.ts" || basename === "index.tsx" || basename === "index.js";
}

function targetSliceHasIndex(layer, slice) {
  if (!slice) return false;
  const sliceDir = path.join(SRC_DIR, layer, slice);
  return (
    fs.existsSync(path.join(sliceDir, "index.ts")) ||
    fs.existsSync(path.join(sliceDir, "index.tsx"))
  );
}

test("Enforce FSD import boundaries and cross-slice public API usage", () => {
  const files = getFiles(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const imports = parseImports(content);
    const { layer: importingLayer, slice: importingSlice } = getLayerAndSlice(file);

    const importingLayerIndex = getLayerIndex(importingLayer);
    if (importingLayerIndex === -1) {
      continue;
    }

    for (const rawImport of imports) {
      const resolved = resolveImport(file, rawImport);
      if (!resolved) continue;

      let actualTargetFile = resolved;
      if (fs.existsSync(actualTargetFile) && fs.statSync(actualTargetFile).isDirectory()) {
        if (fs.existsSync(path.join(actualTargetFile, "index.ts"))) {
          actualTargetFile = path.join(actualTargetFile, "index.ts");
        } else if (fs.existsSync(path.join(actualTargetFile, "index.tsx"))) {
          actualTargetFile = path.join(actualTargetFile, "index.tsx");
        }
      } else if (!fs.existsSync(actualTargetFile)) {
        if (fs.existsSync(actualTargetFile + ".ts")) {
          actualTargetFile += ".ts";
        } else if (fs.existsSync(actualTargetFile + ".tsx")) {
          actualTargetFile += ".tsx";
        } else if (fs.existsSync(actualTargetFile + "/index.ts")) {
          actualTargetFile += "/index.ts";
        } else if (fs.existsSync(actualTargetFile + "/index.tsx")) {
          actualTargetFile += "/index.tsx";
        }
      }

      const { layer: importedLayer, slice: importedSlice } = getLayerAndSlice(actualTargetFile);
      const importedLayerIndex = getLayerIndex(importedLayer);

      if (importedLayerIndex === -1) {
        continue;
      }

      const fileRelative = path.relative(SRC_DIR, file);

      // Rule 1: Layer dependency index check (cannot import from a higher layer)
      if (importedLayerIndex > importingLayerIndex) {
        violations.push({
          file: fileRelative,
          import: rawImport,
          reason: `Layer violation: Layer '${importingLayer}' (index ${importingLayerIndex}) cannot import from '${importedLayer}' (index ${importedLayerIndex})`,
        });
      }

      // Rule 2: Shared layer must not import from any domain layers
      if (importingLayer === "shared" && importedLayer !== "shared") {
        violations.push({
          file: fileRelative,
          import: rawImport,
          reason: `Shared violation: 'shared' layer must not import from domain layer '${importedLayer}'`,
        });
      }

      // Skip cross-slice boundary rules for shared layer since shared has no encapsulation boundaries
      if (importingLayer === "shared" || importedLayer === "shared") {
        continue;
      }

      // Rule 3: Cross-slice boundary check (cross-slice imports must only target index file / public API if index exists)
      if (
        importingLayer === importedLayer &&
        importingSlice !== undefined &&
        importedSlice !== undefined &&
        importingSlice !== importedSlice
      ) {
        if (targetSliceHasIndex(importedLayer, importedSlice) && !isIndexFile(actualTargetFile)) {
          violations.push({
            file: fileRelative,
            import: rawImport,
            reason: `Cross-slice violation within '${importingLayer}': Slice '${importingSlice}' must not import internals of slice '${importedSlice}' ('${path.relative(SRC_DIR, actualTargetFile)}'). Use its public API (index.ts) instead.`,
          });
        }
      }

      // Cross-layer cross-slice boundary check (must only target index file / public API if index exists in target slice)
      if (
        importingLayer !== importedLayer &&
        importedSlice !== undefined
      ) {
        if (targetSliceHasIndex(importedLayer, importedSlice) && !isIndexFile(actualTargetFile)) {
          violations.push({
            file: fileRelative,
            import: rawImport,
            reason: `Cross-layer violation: Component in '${importingLayer}' must not import internals of slice '${importedSlice}' under '${importedLayer}' ('${path.relative(SRC_DIR, actualTargetFile)}'). Use its public API (index.ts) instead.`,
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("FSD Boundary Violations Found:");
    console.error(JSON.stringify(violations, null, 2));
  }

  assert.equal(violations.length, 0, "Should have 0 FSD boundary violations");
});
