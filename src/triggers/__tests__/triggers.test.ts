import { describe, it, expect } from "vitest";
import { triggersPlaceholder } from "../index.js";

describe("triggers", () => {
  it("exports component identifier", () => {
    expect(triggersPlaceholder()).toBe("triggers");
  });
});
