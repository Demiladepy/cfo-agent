import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { err, ok, type Result } from "../lib/result.js";
import { lifiConfigSchema, type LifiConfig } from "./types.js";

export const DEFAULT_LIFI_CONFIG_PATH = "config/lifi.example.yaml";

export function loadLifiConfig(
  path: string,
): Result<LifiConfig, { code: string; message: string }> {
  if (!existsSync(path)) {
    return err({ code: "NOT_FOUND", message: `LiFi config not found: ${path}` });
  }
  try {
    const raw = parseYaml(readFileSync(path, "utf8"));
    const parsed = lifiConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return err({ code: "VALIDATION_ERROR", message: parsed.error.message });
    }
    return ok(parsed.data);
  } catch (e) {
    return err({
      code: "PARSE_ERROR",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
