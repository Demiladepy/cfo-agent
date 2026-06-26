import { describe, it, expect, vi } from "vitest";
import { runRebalanceCheck } from "../scheduler.js";

describe("rebalance watcher", () => {
  it("fires when balance below target float", async () => {
    const onRebalance = vi.fn();
    const result = await runRebalanceCheck({
      memory: { db: {} as never },
      getNgnBalance: async () => 30_000,
      targetNgnFloat: 100_000,
      onRebalanceNeeded: onRebalance,
    });

    expect(result.triggered).toBe(true);
    expect(result.deficit).toBe(70_000);
    expect(onRebalance).toHaveBeenCalledWith(70_000);
  });

  it("does not fire when float sufficient", async () => {
    const onRebalance = vi.fn();
    const result = await runRebalanceCheck({
      memory: { db: {} as never },
      getNgnBalance: async () => 150_000,
      targetNgnFloat: 100_000,
      onRebalanceNeeded: onRebalance,
    });

    expect(result.triggered).toBe(false);
    expect(onRebalance).not.toHaveBeenCalled();
  });
});
