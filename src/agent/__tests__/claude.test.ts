import { describe, it, expect, vi } from "vitest";
import { runClaudeAgent } from "../claude.js";
import type { AgentTools } from "../runner.js";

function mockTools(): AgentTools {
  return {
    wallet: {
      readBalances: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    } as unknown as AgentTools["wallet"],
    lifi: {} as AgentTools["lifi"],
    index: {
      purchaseAirtime: vi.fn(),
      transfer: vi.fn(),
      getNgnBalance: vi.fn(),
    } as AgentTools["index"],
    offramp: {} as AgentTools["offramp"],
    fx: { getUsdToNgn: vi.fn() } as AgentTools["fx"],
    policy: {} as AgentTools["policy"],
    memory: { db: {} } as AgentTools["memory"],
  };
}

describe("runClaudeAgent", () => {
  it("returns Claude text when no tools invoked", async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Hello operator." }],
          stop_reason: "end_turn",
        }),
      },
    };

    const result = await runClaudeAgent(
      {
        tools: mockTools(),
        dryRun: true,
        apiKey: "test",
        client: client as never,
      },
      "hi",
    );

    expect(result.reply).toContain("Hello");
    expect(result.actions).toHaveLength(0);
  });
});
