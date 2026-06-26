import { describe, it, expect, vi } from "vitest";
import { logExternalCall } from "../logger.js";

describe("logExternalCall", () => {
  it("logs input, output, and duration for successful calls", async () => {
    const result = await logExternalCall(
      "test-service",
      "ping",
      { message: "hello" },
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { pong: true };
      },
    );

    expect(result).toEqual({ pong: true });
  });

  it("rethrows errors after logging", async () => {
    await expect(
      logExternalCall("test-service", "fail", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("boot", () => {
  it("defaults to dry-run unless --live is passed", async () => {
    const { parseArgs } = await import("../../app/boot.js");
    expect(parseArgs([])).toEqual({ dryRun: true, live: false });
    expect(parseArgs(["--live"])).toEqual({ dryRun: false, live: true });
  }, 15_000);
});
