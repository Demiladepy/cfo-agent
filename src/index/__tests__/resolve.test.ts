import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveIndexMcp } from "../resolve.js";

describe("resolveIndexMcp", () => {
  it("uses mock when URL missing", () => {
    const { mode } = resolveIndexMcp({ INDEX_MCP_API_KEY: "sk-test" });
    expect(mode).toBe("mock");
  });

  it("uses live transport when URL and key set", () => {
    const { mode } = resolveIndexMcp({
      INDEX_MCP_URL: "https://index.example/mcp",
      INDEX_MCP_API_KEY: "sk-test",
    });
    expect(mode).toBe("live");
  });
});

describe("resolveLifiSdk", () => {
  it("uses mock without integrator", async () => {
    const { resolveLifiSdk } = await import("../../lifi/resolve.js");
    const { mode } = resolveLifiSdk({ LIFI_INTEGRATOR: undefined });
    expect(mode).toBe("mock");
  });
});
