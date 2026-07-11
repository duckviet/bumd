import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(rootDir, "apps/frontend/src");
const layers = ["shared", "entities", "features", "widgets", "pages", "app"];
const sourceExtensions = [".ts", ".tsx"];

function getLayerIndex(layer) {
  return layers.indexOf(layer);
}

function getSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getSourceFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.includes(path.extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getImports(source) {
  const imports = [];
  const importPattern =
    /(?:import\s+(?:type\s+)?[\s\S]*?\s+from\s+|export\s+(?:type\s+)?[\s\S]*?\s+from\s+|import\s*\()\s*["']([^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1]);
  }

  return imports;
}

function resolveImport(importingFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const basePath = specifier.startsWith("@/")
    ? path.join(srcDir, specifier.slice(2))
    : path.resolve(path.dirname(importingFile), specifier);

  for (const extension of sourceExtensions) {
    const filePath = `${basePath}${extension}`;
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  for (const extension of sourceExtensions) {
    const indexPath = path.join(basePath, `index${extension}`);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

function getLayerAndSlice(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  const [layer, slice] = relativePath.split(path.sep);

  if (!layers.includes(layer)) {
    return null;
  }

  return { layer, slice };
}

function sliceHasPublicApi(layer, slice) {
  if (!slice) {
    return false;
  }

  return sourceExtensions.some((extension) =>
    fs.existsSync(path.join(srcDir, layer, slice, `index${extension}`)),
  );
}

function isPublicApiFile(filePath) {
  return /^index\.(ts|tsx)$/.test(path.basename(filePath));
}

test("Enforce FSD import boundaries and cross-slice public API usage", () => {
  const violations = [];

  for (const importingFile of getSourceFiles(srcDir)) {
    const importer = getLayerAndSlice(importingFile);
    if (!importer) {
      continue;
    }

    const importingLayerIndex = getLayerIndex(importer.layer);
    const source = fs.readFileSync(importingFile, "utf8");

    for (const specifier of getImports(source)) {
      const resolvedFile = resolveImport(importingFile, specifier);
      if (!resolvedFile) {
        continue;
      }

      const imported = getLayerAndSlice(resolvedFile);
      if (!imported) {
        continue;
      }

      const importedLayerIndex = getLayerIndex(imported.layer);
      const location = path.relative(rootDir, importingFile);
      const target = path.relative(rootDir, resolvedFile);

      if (importedLayerIndex > importingLayerIndex) {
        violations.push(
          `${location} imports upward from '${specifier}' (${importer.layer} -> ${imported.layer}) at ${target}`,
        );
      }

      if (
        importer.layer === imported.layer &&
        importer.slice &&
        imported.slice &&
        importer.slice !== imported.slice &&
        sliceHasPublicApi(imported.layer, imported.slice) &&
        !isPublicApiFile(resolvedFile)
      ) {
        violations.push(
          `${location} imports cross-slice internals from '${specifier}' instead of ${imported.layer}/${imported.slice}/index.ts`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});
