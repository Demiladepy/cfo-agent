import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { err, ok, type Result } from "../lib/result.js";
import { policyConfigSchema, type PolicyConfig } from "./types.js";

export const DEFAULT_POLICY_PATH = "config/policy.yaml";
export const EXAMPLE_POLICY_PATH = "config/policy.example.yaml";

export type LoadPolicyError = {
  code: "NOT_FOUND" | "PARSE_ERROR" | "VALIDATION_ERROR";
  message: string;
};

export function loadPolicyFromObject(
  raw: unknown,
): Result<PolicyConfig, LoadPolicyError> {
  const parsed = policyConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return err({
      code: "VALIDATION_ERROR",
      message: parsed.error.message,
    });
  }
  return ok(parsed.data);
}

export function loadPolicyFile(
  path: string,
): Result<PolicyConfig, LoadPolicyError> {
  if (!existsSync(path)) {
    return err({
      code: "NOT_FOUND",
      message: `Policy file not found: ${path}`,
    });
  }

  let raw: unknown;
  try {
    const content = readFileSync(path, "utf8");
    raw = parseYaml(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err({ code: "PARSE_ERROR", message });
  }

  return loadPolicyFromObject(raw);
}

export function resolvePolicyPath(
  envPath: string | undefined,
): Result<string, LoadPolicyError> {
  const candidate = envPath ?? DEFAULT_POLICY_PATH;
  if (existsSync(candidate)) {
    return ok(candidate);
  }
  if (existsSync(EXAMPLE_POLICY_PATH)) {
    return ok(EXAMPLE_POLICY_PATH);
  }
  return err({
    code: "NOT_FOUND",
    message: `No policy file at ${candidate} or ${EXAMPLE_POLICY_PATH}`,
  });
}
