import { describe, it, expect } from "vitest";
import { loadPolicyFile } from "../config.js";
import { isOk } from "../../lib/result.js";

describe("policy config loading", () => {
  it("loads example policy yaml", () => {
    const result = loadPolicyFile("config/policy.example.yaml");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.per_tx_cap_ngn).toBeGreaterThan(0);
    }
  });
});
