import { describe, it, expect } from "vitest";
import { agentPlaceholder } from "../index.js";

describe("agent", () => {
  it("exports component identifier", () => {
    expect(agentPlaceholder()).toBe("agent");
  });
});
