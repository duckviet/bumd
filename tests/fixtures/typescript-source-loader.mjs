import { access, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".js") && context.parentURL?.startsWith("file:")) {
    const candidate = fileURLToPath(new URL(specifier.replace(/\.js$/u, ".ts"), context.parentURL));
    try {
      await access(candidate);
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    } catch {
      return nextResolve(specifier, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts")) return nextLoad(url, context);
  const source = await readFile(fileURLToPath(url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
    fileName: fileURLToPath(url),
  });
  return { format: "module", source: transpiled.outputText, shortCircuit: true };
}
