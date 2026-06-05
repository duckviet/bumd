import { parse as parseYaml } from "yaml";

export function parseSpec(rawSpec: string): unknown {
  try {
    const parsed: unknown = JSON.parse(rawSpec);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return parseYaml(rawSpec);
    }
    throw error;
  }
}
